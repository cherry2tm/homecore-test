import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Artifact, CaseAttempt, RunRecord } from "./domain.js";

export interface TestStore {
  close(): void;
  saveRun(run: RunRecord): void;
  listRuns(): RunRecord[];
  saveAttempt(runId: string, attempt: CaseAttempt): void;
  saveArtifact(runId: string, artifact: Artifact): void;
}

export function openTestStore(filename: string): TestStore {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, revision TEXT NOT NULL, branch TEXT NOT NULL,
      profile TEXT NOT NULL, status TEXT NOT NULL, conclusion TEXT NOT NULL,
      started_at TEXT NOT NULL, duration TEXT NOT NULL, passed INTEGER NOT NULL,
      failed INTEGER NOT NULL, blocked INTEGER NOT NULL, evidence_count INTEGER NOT NULL,
      plan_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS case_attempts (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, case_id TEXT NOT NULL,
      attempt INTEGER NOT NULL, verdict TEXT NOT NULL, payload TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(id)
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, relative_path TEXT NOT NULL,
      media_type TEXT NOT NULL, sha256 TEXT, size_bytes INTEGER, source TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(id)
    );
  `);
  const saveRunStatement = db.prepare(`INSERT INTO runs (id, revision, branch, profile, status, conclusion, started_at, duration, passed, failed, blocked, evidence_count, plan_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, conclusion=excluded.conclusion, duration=excluded.duration,
      passed=excluded.passed, failed=excluded.failed, blocked=excluded.blocked, evidence_count=excluded.evidence_count`);
  const store: TestStore = {
    close: () => db.close(),
    saveRun: (run) => saveRunStatement.run(run.id, run.revision, run.branch, run.profile, run.status, run.conclusion, run.startedAt, run.duration, run.passed, run.failed, run.blocked, run.evidenceCount, run.planHash),
    listRuns: () => db.prepare("SELECT id, revision, branch, profile, status, conclusion, started_at AS startedAt, duration, passed, failed, blocked, evidence_count AS evidenceCount, plan_hash AS planHash FROM runs ORDER BY started_at DESC").all().map((row) => ({ ...row })) as unknown as RunRecord[],
    saveAttempt: (runId, attempt) => db.prepare("INSERT OR REPLACE INTO case_attempts (id, run_id, case_id, attempt, verdict, payload) VALUES (?, ?, ?, ?, ?, ?)").run(attempt.id, runId, attempt.caseId, attempt.attempt, attempt.verdict, JSON.stringify(attempt)),
    saveArtifact: (runId, artifact) => db.prepare("INSERT OR REPLACE INTO artifacts (id, run_id, relative_path, media_type, sha256, size_bytes, source) VALUES (?, ?, ?, ?, ?, ?, ?)").run(artifact.id, runId, artifact.relativePath, artifact.mediaType, artifact.sha256 ?? null, artifact.sizeBytes ?? null, artifact.source)
  };
  return store;
}
