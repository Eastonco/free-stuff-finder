import datetime
import os
import random
import re
import time

from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from sqlalchemy import func, select

from .classify import classify
from .db import get_engine_from_env
from .models import Listing, Search, Session, User, init_db, record_cycle
from .notify import notify
from .prettyprint import printError, printInfo, printSuccess, welcome_message

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Present as a normal desktop Firefox-on-Windows user instead of headless
# Firefox-on-Linux. Kept as real Firefox (not Chrome) so the UA matches the
# actual Gecko engine — consistent if the site fingerprints beyond the header.
# ponytail: one stable string beats per-request rotation (a single IP cycling
# UAs looks *more* botty). Bump the version when it ages out, or set
# SCRAPER_USER_AGENT to override.
USER_AGENT = os.getenv(
    "SCRAPER_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
)

engine = get_engine_from_env()
init_db(engine)


def browser_setup():
    firefox_option = Options()
    firefox_option.add_argument('--headless')
    firefox_option.set_preference('general.useragent.override', USER_AGENT)
    # In Docker we point at the standalone Selenium service; bare-metal (Pi) uses
    # a local geckodriver. SELENIUM_REMOTE_URL picks the path.
    remote = os.getenv("SELENIUM_REMOTE_URL")
    if remote:
        browser = webdriver.Remote(command_executor=remote, options=firefox_option)
    else:
        browser = webdriver.Firefox(options=firefox_option)
    browser.implicitly_wait(1)
    return browser


def _first_image(el):
    # ponytail: gallery cards lazy-load images; src is usually set
    # once the card is in view. If thumbnails come back empty, this is where to
    # scroll the card into view or read a data-* attribute instead.
    try:
        return el.find_element(By.CSS_SELECTOR, 'img').get_attribute('src')
    except Exception:
        return None


def parse_listings(browser):
    """Scrape the current gallery page into plain dicts (search-agnostic)."""
    try:
        WebDriverWait(browser, 5).until(
            EC.presence_of_element_located((By.CLASS_NAME, 'cl-search-result')))
    except TimeoutException:
        pass

    out = []
    for el in browser.find_elements(by=By.CLASS_NAME, value='cl-search-result'):
        try:
            a_tag = el.find_element(By.CLASS_NAME, 'posting-title')
            title = a_tag.text
            link = a_tag.get_attribute('href')
            cl_id = link.split(sep='/')[-1].removesuffix('.html')
            meta = el.find_element(by=By.CLASS_NAME, value='meta').text
            # the .meta element separates posted-time and location with a newline
            posted_time, _, location = meta.partition('\n')
            out.append({
                'title': title,
                'link': link,
                'cl_id': cl_id,
                'image_url': _first_image(el),
                'time_posted': posted_time.strip(),
                'location': location.strip(),
            })
        except Exception as exc:
            printError(f'skipping a malformed card: {exc}')
    return out


def _excluded(title: str, filters: list) -> bool:
    """Whole-word, case-insensitive hard-exclude (replaces the old regex gate)."""
    return any(re.search(rf'\b{re.escape(w)}\b', title, re.IGNORECASE) for w in filters)


def _store(session, search_id, p, *, label=None, score=None, reason=None, timestamp=''):
    session.add(Listing(
        search_id=search_id, cl_id=p['cl_id'], link=p['link'], title=p['title'],
        image_url=p['image_url'], ai_label=label, ai_score=score, ai_reason=reason,
        time_posted=p['time_posted'], location=p['location'], time_scraped=timestamp))
    session.commit()


def process_search(search: Search, user: User, session, timestamp: str):
    # First time we've ever seen this search: record what's already there so we
    # don't flood the user (and don't pay to classify a backlog). No alerts.
    seen = session.scalar(select(func.count()).select_from(Listing)
                          .where(Listing.search_id == search.id))
    is_backfill = (seen == 0)

    for url in search.urls:
        browser = browser_setup()
        try:
            browser.get(url)
            parsed = parse_listings(browser)
        except Exception as exc:
            printError(f'scrape failed for {url}: {exc}')
            continue
        finally:
            browser.quit()

        for p in parsed:
            already = session.scalar(select(Listing.id).where(
                Listing.search_id == search.id, Listing.cl_id == p['cl_id']))
            if already:
                continue

            if is_backfill:
                _store(session, search.id, p, reason='backfill', timestamp=timestamp)
                continue

            if _excluded(p['title'], search.exclude_filters):
                _store(session, search.id, p, label='skip', score=0,
                       reason='excluded by filter', timestamp=timestamp)
                continue

            result = classify(p['title'], p['image_url'], search.preference_prompt, ANTHROPIC_API_KEY)
            _store(session, search.id, p, label=result['label'],
                   score=result['score'], reason=result['reason'], timestamp=timestamp)
            printInfo(f"[{result['label']} {result['score']}] {p['title']} — {result['reason']}")

            if result['label'] == 'want':
                notify(user, p['title'], result['reason'], p['link'], p['image_url'])

    if is_backfill:
        printSuccess(f'search {search.id}: backfilled {seen if seen else "0"} → baseline set, no alerts')


def sleep_random(lval, rval):
    seconds = random.randint(lval, rval)
    nxt = datetime.datetime.now() + datetime.timedelta(seconds=seconds)
    printInfo(f"{datetime.datetime.now().strftime('%H:%M:%S')} - Sleeping {seconds}s, "
              f"next at {nxt.strftime('%H:%M:%S')}")
    time.sleep(seconds)


def main():
    welcome_message()
    while True:
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with Session(engine) as session:
            status = record_cycle(session)  # heartbeat for the admin dashboard
            if not status.scraper_enabled:
                printInfo('Scraper disabled via admin panel — skipping cycle.')
                sleep_random(45, 90)
                continue
            searches = session.scalars(select(Search).where(Search.active.is_(True))).all()
            if not searches:
                printInfo('No active searches. Add one via the web app.')
            for search in searches:
                user = session.get(User, search.user_id)
                if not user:
                    continue
                try:
                    process_search(search, user, session, timestamp)
                except Exception as exc:
                    printError(f'search {search.id} failed this cycle: {exc}')
                sleep_random(5, 15)
        sleep_random(45, 90)


if __name__ == "__main__":
    main()
