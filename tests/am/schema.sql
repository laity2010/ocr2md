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
-- Observed cross-component access. 'debt' is documented, never authorized.
CREATE TABLE access_edges(
  id TEXT PRIMARY KEY,
  caller_module TEXT REFERENCES modules(id),
  target_module TEXT NOT NULL REFERENCES modules(id),
  source_file TEXT NOT NULL,
  source_needle TEXT NOT NULL,
  api_id TEXT REFERENCES apis(id),
  classification TEXT NOT NULL CHECK(classification IN ('registered','debt','test_only')),
  rationale TEXT NOT NULL
);
CREATE INDEX edges_by_target ON access_edges(target_module,classification);
-- Unlike active edges, history records survive removal of offending code.
CREATE TABLE architecture_findings(
  id TEXT PRIMARY KEY, first_recorded_commit TEXT NOT NULL,
  original_classification TEXT NOT NULL CHECK(original_classification='debt'),
  original_source TEXT NOT NULL, finding TEXT NOT NULL,
  resolution TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('open','resolved'))
);

CREATE TABLE test_cases(
  id TEXT PRIMARY KEY, api_id TEXT REFERENCES apis(id),
  message_id TEXT REFERENCES messages(id),
  subscription_id TEXT REFERENCES subscriptions(id),
  publisher_id TEXT REFERENCES publishers(id),
  script TEXT NOT NULL, fixture TEXT NOT NULL, expected TEXT NOT NULL,
  evidence TEXT NOT NULL CHECK(evidence IN ('direct','integration')),
  CHECK((api_id IS NOT NULL)+(message_id IS NOT NULL)+(subscription_id IS NOT NULL)+(publisher_id IS NOT NULL)=1)
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
