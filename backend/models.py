import datetime
import secrets
from typing import Optional

from sqlalchemy import (Boolean, ForeignKey, Integer, JSON, String,
                        UniqueConstraint, create_engine, select)
from sqlalchemy.orm import (DeclarativeBase, Mapped, MappedAsDataclass, Session,
                            mapped_column)


# format is postgresql://username:password@host:port/database
def get_engine(user: str = 'postgres', password: str = 'password', host: str = 'localhost', port: str = '5432', database: str = 'craigslist', echo: bool = False):
    SQLALCHEMY_DATABASE_URL = f'postgresql://{user}:{password}@{host}:{port}/{database}'
    return create_engine(SQLALCHEMY_DATABASE_URL, echo=echo)


class Base(MappedAsDataclass, DeclarativeBase):
    pass


def _new_token() -> str:
    return secrets.token_urlsafe(16)


def _now() -> str:
    return datetime.datetime.now().isoformat()


class User(Base):
    """One person (you or a friend). Created via the self-serve web form."""
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(Integer, init=False, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    # 'ntfy' (default) or 'sms'
    notify_channel: Mapped[str] = mapped_column(String, default='ntfy')
    # ntfy topic OR E.164 phone, depending on channel
    notify_target: Mapped[str] = mapped_column(String, default='')
    # unguessable token; the only thing gating profile edits
    edit_token: Mapped[str] = mapped_column(String, default_factory=_new_token, unique=True)
    created_at: Mapped[str] = mapped_column(String, default_factory=_now)
    # used by the web "GET" button to draft a pickup message to a seller
    pickup_phone: Mapped[Optional[str]] = mapped_column(String, default=None)  # E.164, optional
    pickup_note: Mapped[Optional[str]] = mapped_column(String, default=None)   # free-text, woven into the AI message


class Search(Base):
    """A user's saved search: which URLs to scrape and what they're after."""
    __tablename__ = 'searches'

    id: Mapped[int] = mapped_column(Integer, init=False, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    urls: Mapped[list] = mapped_column(JSON)               # list[str]
    preference_prompt: Mapped[str] = mapped_column(String)  # plain-English wishlist
    exclude_filters: Mapped[list] = mapped_column(JSON, default_factory=list)  # list[str] hard-exclude words
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(String, default_factory=_now)


class Listing(Base):
    """A scraped post. Dedup is per (search_id, cl_id)."""
    __tablename__ = 'listings'
    __table_args__ = (UniqueConstraint('search_id', 'cl_id', name='uq_search_cl_id'),)

    id: Mapped[int] = mapped_column(Integer, init=False, primary_key=True)
    search_id: Mapped[int] = mapped_column(ForeignKey('searches.id'))
    cl_id: Mapped[str] = mapped_column(String)
    link: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    image_url: Mapped[Optional[str]] = mapped_column(String, default=None)
    ai_label: Mapped[Optional[str]] = mapped_column(String, default=None)   # 'want' | 'skip'
    ai_score: Mapped[Optional[int]] = mapped_column(Integer, default=None)  # 0-100
    ai_reason: Mapped[Optional[str]] = mapped_column(String, default=None)
    time_posted: Mapped[str] = mapped_column(String, default='')
    location: Mapped[str] = mapped_column(String, default='')
    time_scraped: Mapped[str] = mapped_column(String, default='')

    def __repr__(self):
        return f'[{self.ai_label}] {self.title} : {self.link}'


class Reaction(Base):
    """Thumbs up/down on a listing. Schema only for now — populated later by
    the deferred web feed, then used to train a learned classifier."""
    __tablename__ = 'reactions'

    id: Mapped[int] = mapped_column(Integer, init=False, primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey('listings.id'))
    reaction: Mapped[str] = mapped_column(String)  # 'up' | 'down'
    reacted_at: Mapped[str] = mapped_column(String, default_factory=_now)


class ScraperStatus(Base):
    """Single-row heartbeat so the admin page can tell the loop is alive. A real
    heartbeat beats max(time_scraped), which only advances when new posts appear."""
    __tablename__ = 'scraper_status'

    id: Mapped[int] = mapped_column(Integer, init=False, primary_key=True)
    last_cycle_at: Mapped[str] = mapped_column(String, default_factory=_now)
    cycle_count: Mapped[int] = mapped_column(Integer, default=0)
    scraper_enabled: Mapped[bool] = mapped_column(Boolean, default=True)  # admin remote kill-switch


def record_cycle(session):
    """Call once per scraper loop cycle to update the heartbeat. Returns the row
    so callers can read the scraper_enabled flag without a second query."""
    row = session.scalars(select(ScraperStatus)).first()
    if row is None:
        row = ScraperStatus()
        session.add(row)
    row.last_cycle_at = _now()
    row.cycle_count = (row.cycle_count or 0) + 1
    session.commit()
    return row


def init_db(engine):
    Base.metadata.create_all(engine)
