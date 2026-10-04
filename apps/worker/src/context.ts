import type { Db } from "@fsf/db";
import type { Classifier, FailureWindow, Notifier } from "@fsf/engine";

import type { QueueName } from "./queues";

export type Enqueue = (queue: QueueName, jobs: { data: object; singletonKey?: string }[]) => Promise<void>;

export type Logger = {
  info: (msg: string, fields?: object) => void;
  warn: (msg: string, fields?: object) => void;
  error: (msg: string, fields?: object) => void;
};

/** Everything a job needs, injected so jobs run the same under pg-boss and in tests. */
export type Ctx = {
  db: Db;
  enqueue: Enqueue;
  /** Throttled, UA-set GET returning HTML; throws HttpError on non-2xx. */
  fetchHtml: (url: string) => Promise<string>;
  classify: Classifier;
  notify: Notifier;
  failures: FailureWindow;
  now: () => Date;
  log: Logger;
  settings: {
    scrapeIntervalSeconds: number;
    notifyDryRun: boolean;
    /** consecutive empty parses of a URL before we shout about it */
    emptyParseWarnAfter: number;
  };
};

export const consoleLogger: Logger = {
  info: (msg, fields) => console.log(JSON.stringify({ level: "info", t: new Date().toISOString(), msg, ...fields })),
  warn: (msg, fields) => console.warn(JSON.stringify({ level: "warn", t: new Date().toISOString(), msg, ...fields })),
  error: (msg, fields) =>
    console.error(JSON.stringify({ level: "error", t: new Date().toISOString(), msg, ...fields })),
};
