# Git Workflow — Smart Student Companion

> Documentation only. **No Git configuration was modified.** This describes the
> project's actual/intended workflow as evidenced by repository history and the daily
> development process.

---

## Branches

- `main` — integration branch (backend work lands here; completed frontend days merge
  here). `origin/HEAD` → `origin/main`.
- `frontfeat` — Xcaliber's frontend working branch (all daily frontend commits).
- Legacy: `origin/day-01-foundation` (Day-1 era), local `fix/budget-and-mode-filtering`
  (hackathon era) — not part of the workflow.

## The daily cycle (frontend days)

**Phase A — sync BEFORE starting daily implementation (mandatory order):**

```bash
git fetch origin
git switch main
git pull origin main
git switch frontfeat
git pull origin frontfeat
git merge main            # main → frontfeat; resolve conflicts carefully
```

Rules observed in practice:

- Conflicts: inspect each one; preserve BOTH the completed frontend work and the newer
  main work — never blanket `--ours`/`--theirs`.
- If a merge commit is required: `git commit -m "merge(main): sync latest main into
  frontfeat"` (historical examples: `d2cd56a`, `2cf7833`, `8dcb247`). If Git says
  "Already up to date", **do not** create an empty merge commit (observed Day 9).
- Run the existing checks after conflict resolution, then:
  `git push origin frontfeat`

**Phase B — the day's work:**

- Exactly **7 commits** per day with the day's fixed messages (each task = exactly one
  commit; no combining, no extra implementation commits).
- Push every commit immediately:
  `git add <files> && git commit -m "<message>" && git push origin frontfeat`
- No waiting between commits; keep each commit scoped and independently verifiable
  (run `npm run verify` + `npm run build` before each).

**Phase C — end of day (frontfeat → main, AFTER work is complete):**

```bash
git fetch origin
git switch main && git pull origin main
git switch frontfeat && git pull origin frontfeat && git merge main   # final sync
# run checks (verify + build), then:
git push origin frontfeat

git switch main && git pull origin main
git merge frontfeat        # fast-forward or conflict resolution (preserve both sides)
# run checks again, then:
git push origin main
```

### Summary

| When | Direction | Why |
|---|---|---|
| **Before** daily frontend implementation | `main` → `frontfeat` | Start from the latest integrated state (incl. new backend work). |
| During the day | each commit → `origin/frontfeat` | Immediate, incremental backup/review. |
| **After** the day's work | `frontfeat` → `main` | Publish the completed day to the integration branch. |

## Hard rules (from project process)

- Work only on the existing `frontfeat` branch — **no new branches**.
- **No force-push.** Never delete `frontfeat`.
- Never leave uncommitted changes at end of day.
- Frontend/PWA commits only from Xcaliber; backend work comes from `main` via merge.
- Backend (Skan) work is never committed by the frontend role.

## Observed merge/sync commits in history (evidence)

| Commit | Message | When |
|---|---|---|
| `88ad30e` | `Merging Day 1` | initial Day-1 integration |
| `2f7a969` | `Merge pull request #1 from Xcaliber5410/day-01-foundationXcaliber` | Day-1 PR |
| `badf03b` / `0c2e027` | merge `day-01-foundationXcaliber` (→ main) | Day-1 integration |
| `49c4cd2` | `Merge branch 'main' into day-01-foundationxcaliber` | pre-Day-3 sync |
| `d2cd56a` | `merge(main): sync latest main into frontfeat` | Day-5 start sync |
| `2cf7833` | `Merge branch 'main' into frontfeat` | Day-6 start sync (academic backend) |
| `8dcb247` | `Merge branch 'main' into frontfeat` | Day-8 start sync (goals backend) |

(Other day-start syncs fast-forwarded without producing merge commits — "Already up to
date" or FF — and are therefore invisible in history.)

## Documentation commit (this task)

```bash
git add docs/project-context
git commit -m "docs: establish cumulative project context"
git push origin frontfeat
# then: sync main → frontfeat (verify clean), push frontfeat,
# then: merge frontfeat → main, push main
```
