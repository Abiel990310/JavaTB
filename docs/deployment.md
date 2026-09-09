# Deploying

## Static, no compiler (the simple case)

```bash
npm run build
```

`dist/` is a complete static site: pre-rendered HTML for every chapter, a search
index, and ~12 KB of gzipped JavaScript. Serve it from anywhere — GitHub Pages,
Netlify, S3, nginx. No server-side anything is required.

### If it is not served from the domain root

Every link, asset, and runtime fetch is written with an absolute path, so a site
deployed under a sub-path needs to be built with that prefix:

```bash
TB_BASE=/JavaTB/ npm run build
```

A GitHub Pages *project* site is exactly this case — it lives at
`https://<user>.github.io/<repo>/`. The deploy workflow sets `TB_BASE` from
the repository name automatically, so nothing needs changing there.

Pages needs no manual setup here, but the route matters. The obvious one —
`actions/configure-pages` plus `upload-pages-artifact` — fails on a fresh
repository with `Resource not accessible by integration`: `GITHUB_TOKEN` is not
permitted to create a Pages site, even with `pages: write`, so someone has to
flip **Settings → Pages → Source: GitHub Actions** first.

`deploy.yml` avoids that by force-pushing the built site to a `gh-pages`
branch. Pushing that branch to a public repository enables Pages on its own,
and `GITHUB_TOKEN` can push a branch with plain `contents: write`. The
trade-off is that the built output lives in the repository's history on that
branch; it is force-pushed each time, so it does not accumulate. A custom
domain or a user site (`<user>.github.io`) serves from the root, and needs no
base at all.

Forgetting this produces a page that loads with no styling and every link
404ing, because each one resolves against the domain root instead.

Readers still get working Run buttons: with no `/api/compile` on the origin, the
client falls back to Compiler Explorer's public API
(`src/lib/compile-client.ts`). That is someone else's free service, so if this
book ever gets real traffic, either self-host the compiler or talk to them
first.

## Self-hosting the compiler

`npm run serve` starts `server/standalone.ts`, which serves `dist/` and answers
`POST /api/compile` by invoking `javac` and `java` locally.

**This executes arbitrary Java submitted by anyone who can reach the page.**

What `server/compile.ts` already does:

- a fresh temporary directory per request, removed afterwards
- a 20 s compile timeout and a 6 s run timeout, both enforced by `SIGKILL`
- `ulimit -f` (8 MB file writes) and `ulimit -c 0` (no core dumps)
- `-Xmx512m -Xss8m -XX:+ExitOnOutOfMemoryError`, which is how memory is bounded
  — `ulimit -v` cannot be used, because the JVM reserves far more virtual
  address space than it commits and refuses to start under an address-space cap
- a child environment built from nothing rather than inherited, so a variable
  like `JAVA_TOOL_OPTIONS` in the server's environment cannot inject flags into
  every submission
- output truncated at 96 KB
- a token bucket of 12 compilations per minute per IP
- a fixed argument list: the language version is matched against an allowlist,
  and nothing else from the request reaches the command line

What it does **not** do, and what you must add before exposing it:

- **No filesystem isolation.** The compiled program runs as the server's user
  and can read anything that user can read. Java offers nothing to help here:
  the security manager was deprecated in 17 and is gone, so there is no
  in-process sandbox to fall back on.
- **No network isolation.** The program can open sockets.
- **No process limit.** `ulimit -u` is per-user, not per-request, so setting it
  would throttle the server itself. A fork bomb is contained only by the 6 s
  timeout.

The supported way to run this is inside a throwaway container, one that has the
toolchain and nothing else:

```dockerfile
FROM eclipse-temurin:21-jdk
# The image ships a JDK but no Node, and the server is a Node process.
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*
RUN useradd --no-create-home --shell /usr/sbin/nologin runner
WORKDIR /srv
COPY dist ./dist
COPY server ./server
COPY package.json ./
USER runner
ENV NODE_ENV=production
CMD ["node", "--experimental-strip-types", "server/standalone.ts"]
```

Run it with `--network=none` for the container that compiles, a read-only root
filesystem, a memory cap, and a pids limit:

```bash
docker run --rm --network=none --read-only --tmpfs /tmp:size=64m \
  --memory=2g --pids-limit=128 --cpus=1 -p 4173:4173 javatb
```

For a public deployment, prefer a purpose-built sandbox — nsjail, gVisor, or
Firecracker — with one throwaway sandbox per compilation. That is what Compiler
Explorer and Godbolt-alikes do, and it is not a corner worth cutting.

## Choosing a toolchain

Three variables select the binaries: `TB_COMPILER` (default `javac`),
`TB_RUNTIME` (default `java`) and `TB_DISASSEMBLER` (default `javap`). Point
them at a specific JDK to check the book against another release:

```bash
TB_COMPILER=/opt/jdk-25/bin/javac \
TB_RUNTIME=/opt/jdk-25/bin/java \
TB_DISASSEMBLER=/opt/jdk-25/bin/javap \
  npm run verify:snippets
```

The book is written against Java 21 and every sample is compiled with
`--release`, so a newer JDK still rejects a sample that uses something the
declared version does not have. That is deliberate: the version in a chapter's
front-matter is a promise to the reader, and the verifier is what keeps it.
