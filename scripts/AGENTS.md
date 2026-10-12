# Tooling and test safety

Inherit root requirements. Use Node 24 native TypeScript (`.mts/.cts`) and explicit
extensions; add every module to the strict projects, not a JavaScript exception.
Root `typecheck:tooling`, `check:typescript-migration`, `check:hygiene` and
`check:size` must pass. Keep the generated preinstall/URI compatibility artifacts
byte-verified; do not hand-edit their JavaScript.

Scripts mix offline tests, artifact builders and HISTORICAL PRODUCTION OPERATIONS.
Inspect imports, configuration, URLs, network/SQL actions and exact path guards
before execution. `test`, `prepare`, `check` and `candidate` are not safety labels.
Use the package scripts and explicit CI allowlists; never run `test-*.mts` as a glob.
Do not run apply/release/launch/secret-sync/linked SQL during repository cleanup.

Keep scripts/fixtures, __mocks__, browser fixtures and regression tests when their
contracts remain active. Offline mocks deny unhandled public requests. Never lower
coverage budgets, delete failing cases or expand legacy size caps to pass checks.
Database tests use only owned local disposable containers, pinned images and
synthetic records. Verify ownership before removing containers/directories.

Generated output belongs under ignored test-results/ or reviewed build directories;
no credentials, provider payloads, release binaries or private evidence in Git.
Retain unique rollback copies and acceptance evidence; old age alone does not make
them disposable. Before removing source, prove non-use across imports, framework
entry points, package scripts, fixture registries, CI and release packagers.
Document deletions/recovery. Never delete or overwrite another retained checkout.
