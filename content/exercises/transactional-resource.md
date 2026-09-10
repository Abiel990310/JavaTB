---
id: transactional-resource
title: "Commit, or roll back automatically"
difficulty: core
chapter: try-with-resources
topics: [try-with-resources, AutoCloseable, design]
check: unit
standard: java21
---

Write a `Transaction` resource that undoes itself unless it was told not to.

- `new Transaction(List<String> log)` appends `"begin"`.
- `commit()` appends `"commit"`.
- `close()` appends `"rollback"` **only if commit was never called**, and
  appends nothing otherwise.
- Closing twice must not append anything the second time.

Then write `transfer(List<String> log, boolean shouldFail)` which opens a
transaction in a try-with-resources block, appends `"transfer"`, and commits —
unless `shouldFail` is true, in which case it throws
`IllegalStateException("insufficient funds")` after appending `"transfer"` but
before committing. The exception must escape.

## Starter
```java
static class Transaction implements AutoCloseable {
    private final List<String> log;

    Transaction(List<String> log) {
        this.log = log;
        log.add("begin");
    }

    void commit() {
        log.add("commit");
    }

    @Override
    public void close() {
        log.add("rollback");
    }
}

static void transfer(List<String> log, boolean shouldFail) {
    Transaction tx = new Transaction(log);
    log.add("transfer");
    if (shouldFail) {
        throw new IllegalStateException("insufficient funds");
    }
    tx.commit();
}
```

## Tests
```java
List<String> ok = new ArrayList<>();
transfer(ok, false);
checkEq(ok, List.of("begin", "transfer", "commit"));

List<String> bad = new ArrayList<>();
boolean threw = false;
try {
    transfer(bad, true);
} catch (IllegalStateException e) {
    threw = true;
    checkEq(e.getMessage(), "insufficient funds");
}
check(threw);
checkEq(bad, List.of("begin", "transfer", "rollback"));

List<String> twice = new ArrayList<>();
Transaction tx = new Transaction(twice);
tx.close();
tx.close();
checkEq(twice, List.of("begin", "rollback"));

List<String> committed = new ArrayList<>();
Transaction done = new Transaction(committed);
done.commit();
done.close();
done.close();
checkEq(committed, List.of("begin", "commit"));
```

## Hints
- `Transaction` needs to remember whether it was committed, and `close()` must
  check that flag.
- It also needs to remember whether it was already closed, or the second
  `close()` appends a second rollback.
- `transfer` must use try-with-resources so the failing path rolls back without
  a `catch`.
- On the success path, `commit()` is the last thing in the block; `close()`
  then does nothing.

## Solution
```java
static class Transaction implements AutoCloseable {
    private final List<String> log;
    private boolean committed;
    private boolean closed;

    Transaction(List<String> log) {
        this.log = log;
        log.add("begin");
    }

    void commit() {
        log.add("commit");
        committed = true;
    }

    @Override
    public void close() {
        if (closed) {
            return;
        }
        closed = true;
        if (!committed) {
            log.add("rollback");
        }
    }
}

static void transfer(List<String> log, boolean shouldFail) {
    try (Transaction tx = new Transaction(log)) {
        log.add("transfer");
        if (shouldFail) {
            throw new IllegalStateException("insufficient funds");
        }
        tx.commit();
    }
}
```

## Notes
`transfer` contains no rollback and no `catch`, and rolls back correctly on
every failing path — including ones that do not exist yet. Add a second check
that throws, or a `return` in the middle, and the behaviour is still right,
because the undo is attached to the resource rather than to any particular way
of leaving the block.

That is the real argument for this shape. A hand-written version has to name
every exit, and the bug arrives when somebody adds an exit and does not.

**Idempotent close.** `AutoCloseable` explicitly does not require it, but
implementing it is strongly recommended and the checks here insist. A resource
can be closed by a try-with-resources block *and* by code that closed it early,
and a `close()` that acts twice turns that into a duplicate rollback — or, in a
real system, a second attempt to release a connection that has already gone
back to the pool. The `closed` flag is two lines and removes a whole category
of problem.

**The order inside `commit()` does not matter here but usually would.** In a
real transaction, setting `committed = true` before the commit actually
succeeds would mean a failed commit is never rolled back. Set the flag after
the work, so a failure leaves the object in the state that triggers cleanup.
