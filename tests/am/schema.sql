-- AM registry: editable truth lives in Git-tracked registry.sql; SQLite is rebuilt, never hand-edited.
PRAGMA foreign_keys=ON;
CREATE TABLE modules(id TEXT PRIMARY KEY, name TEXT NOT NULL, library TEXT NOT NULL, source_file TEXT NOT NULL);
CREATE TABLE apis(
  id TEXT PRIMARY KEY, module_id TEXT NOT NULL REFERENCES modules(id),
  symbol TEXT NOT NULL, source_file TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('export','returned','internal','raw')),
  arguments TEXT NOT NULL, result TEXT NOT NULL, effects TEXT NOT NULL,
  core INTEGER NOT NULL CHECK(core IN (0,1)),
  UNIQUE(module_id,symbol,source_file)
);
CREATE TABLE messages(
  id TEXT PRIMARY KEY, transport TEXT NOT NULL CHECK(transport IN ('zustand','dom')),
  topic TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
  core INTEGER NOT NULL CHECK(core IN (0,1)),
  UNIQUE(transport,topic)
);
CREATE TABLE publishers(
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id),
  module_id TEXT REFERENCES modules(id),
  source_file TEXT NOT NULL, symbol TEXT NOT NULL, cause TEXT NOT NULL
);
CREATE TABLE subscriptions(
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id),
  module_id TEXT REFERENCES modules(id),
  source_file TEXT NOT NULL, handler TEXT NOT NULL,
  condition TEXT NOT NULL, effects TEXT NOT NULL
);
CREATE TABLE test_cases(
  id TEXT PRIMARY KEY, api_id TEXT REFERENCES apis(id),
  message_id TEXT REFERENCES messages(id),
  subscription_id TEXT REFERENCES subscriptions(id),
  script TEXT NOT NULL, fixture TEXT NOT NULL, expected TEXT NOT NULL,
  evidence TEXT NOT NULL CHECK(evidence IN ('direct','integration')),
  CHECK((api_id IS NOT NULL)+(message_id IS NOT NULL)+(subscription_id IS NOT NULL)=1)
);
CREATE TABLE test_runs(
  id INTEGER PRIMARY KEY, case_id TEXT NOT NULL REFERENCES test_cases(id),
  git_commit TEXT NOT NULL, ran_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PASS','FAIL','ERROR','SKIP')),
  output_file TEXT, detail TEXT
);
CREATE INDEX subscriptions_by_message ON subscriptions(message_id);
CREATE INDEX publishers_by_message ON publishers(message_id);
CREATE INDEX apis_by_module ON apis(module_id);
CREATE INDEX test_cases_by_api ON test_cases(api_id);
