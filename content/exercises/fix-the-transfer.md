---
id: fix-the-transfer
title: "Transfers that neither lose money nor deadlock"
difficulty: stretch
chapter: threads
topics: [concurrency, deadlock, lock-ordering, invariants]
check: unit
standard: java21
---

The classic. `Account` holds a balance; `transfer` moves money between two of
them. Get it right under four threads transferring in both directions at once.

- `static final class Account` — `Account(long id, long balance)`, `long id()`,
  `long balance()`, and package-private `deposit`/`withdraw` if you want them.
  Reading a balance must be safe from any thread.
- `static void transfer(Account from, Account to, long amount)` — moves
  `amount`; throws `IllegalArgumentException` for a negative amount, for a
  transfer to the same account, or when `from` has insufficient funds. Either
  both balances change or neither does.
- `static long total(List<Account> accounts)` — the sum of the balances
- `static void transferMany(List<Account> accounts, int threads, int perThread)`
  — runs `threads` threads; each performs `perThread` transfers of 1 between
  randomly chosen distinct accounts, ignoring `IllegalArgumentException` from
  an insufficient balance, and returns once every thread has finished

The invariant the tests check: **the total never changes**, and no run
deadlocks.

## Starter
```java
static final class Account {
    private final long id;
    private long balance;

    Account(long id, long balance) {
        this.id = id;
        this.balance = balance;
    }

    long id() {
        return id;
    }

    long balance() {
        return balance;
    }

    void deposit(long amount) {
        balance += amount;
    }

    void withdraw(long amount) {
        balance -= amount;
    }
}

static void transfer(Account from, Account to, long amount) {
    synchronized (from) {
        synchronized (to) {
            from.withdraw(amount);
            to.deposit(amount);
        }
    }
}

static long total(List<Account> accounts) {
    long sum = 0;
    for (Account account : accounts) {
        sum += account.balance();
    }
    return sum;
}

static void transferMany(List<Account> accounts, int threads, int perThread) throws InterruptedException {
    for (int i = 0; i < threads; i++) {
        new Thread(() -> {
            Random random = new Random();
            for (int j = 0; j < perThread; j++) {
                int a = random.nextInt(accounts.size());
                int b = random.nextInt(accounts.size());
                transfer(accounts.get(a), accounts.get(b), 1);
            }
        }).start();
    }
}
```

## Tests
```java
Account alice = new Account(1, 100);
Account bob = new Account(2, 50);

transfer(alice, bob, 30);
checkEq(alice.balance(), 70L);
checkEq(bob.balance(), 80L);

checkThrows(IllegalArgumentException.class, () -> transfer(alice, bob, -1));
checkThrows(IllegalArgumentException.class, () -> transfer(alice, alice, 10));
checkThrows(IllegalArgumentException.class, () -> transfer(alice, bob, 1000));

// A refused transfer must leave both balances alone.
checkEq(alice.balance(), 70L);
checkEq(bob.balance(), 80L);

transfer(alice, bob, 0);
checkEq(alice.balance(), 70L);
checkEq(bob.balance(), 80L);

List<Account> accounts = new ArrayList<>();
for (int i = 0; i < 6; i++) {
    accounts.add(new Account(i, 1_000));
}
long before = total(accounts);
checkEq(before, 6_000L);

transferMany(accounts, 4, 20_000);

// Every thread has finished, no money was created or destroyed, and nothing
// went negative.
checkEq(total(accounts), before);
for (Account account : accounts) {
    check(account.balance() >= 0);
}

// Running it again from wherever the balances landed keeps the invariant.
transferMany(accounts, 4, 10_000);
checkEq(total(accounts), before);
```

## Hints
- The starter's `transferMany` never joins its threads, so the assertions run
  while transfers are still happening. Keep the `Thread` objects and `join()`
  them all.
- Two threads transferring A→B and B→A at the same time take the two locks in
  opposite orders. That is the chapter's deadlock, and with 20,000 iterations
  it will happen.
- Order the locks by something stable and total. `id()` is there for exactly
  this.
- Equal ids would break an ordering by id alone; here ids are distinct, and
  `transfer` rejects a self-transfer anyway, so the ordering is strict.
- The balance check must happen **inside** the locks, or the check and the
  withdrawal are a check-then-act pair and a balance can go negative.
- `balance()` reading an unguarded `long` is not safe — and a `long` is worse
  than an `int`, because a non-volatile 64-bit read is not even guaranteed to
  be atomic. Guard the read with the same lock.
- `Random` is thread-safe but contended; `ThreadLocalRandom.current()` is the
  one to use inside threads.

## Solution
```java
import java.util.concurrent.ThreadLocalRandom;

static final class Account {
    private final long id;
    private long balance;

    Account(long id, long balance) {
        this.id = id;
        this.balance = balance;
    }

    long id() {
        return id;
    }

    long balance() {
        synchronized (this) {
            return balance;
        }
    }

    void deposit(long amount) {
        balance += amount;
    }

    void withdraw(long amount) {
        balance -= amount;
    }
}

static void transfer(Account from, Account to, long amount) {
    if (amount < 0) {
        throw new IllegalArgumentException("negative amount: " + amount);
    }
    if (from == to) {
        throw new IllegalArgumentException("same account: " + from.id());
    }

    Account first = from.id() < to.id() ? from : to;
    Account second = first == from ? to : from;

    synchronized (first) {
        synchronized (second) {
            if (from.balance < amount) {
                throw new IllegalArgumentException(
                    "insufficient funds in " + from.id() + ": " + from.balance);
            }
            from.withdraw(amount);
            to.deposit(amount);
        }
    }
}

static long total(List<Account> accounts) {
    long sum = 0;
    for (Account account : accounts) {
        sum += account.balance();
    }
    return sum;
}

static void transferMany(List<Account> accounts, int threads, int perThread)
        throws InterruptedException {
    Thread[] workers = new Thread[threads];
    for (int i = 0; i < threads; i++) {
        workers[i] = new Thread(() -> {
            for (int j = 0; j < perThread; j++) {
                int a = ThreadLocalRandom.current().nextInt(accounts.size());
                int b = ThreadLocalRandom.current().nextInt(accounts.size());
                if (a == b) {
                    continue;
                }
                try {
                    transfer(accounts.get(a), accounts.get(b), 1);
                } catch (IllegalArgumentException insufficient) {
                    // an account ran dry; nothing moved
                }
            }
        });
    }
    for (Thread worker : workers) {
        worker.start();
    }
    for (Thread worker : workers) {
        worker.join();
    }
}
```

## Notes
Four separate bugs, and the tests are arranged so each one shows up as a
different symptom.

**No join.** The starter's `transferMany` returns immediately, so
`total(accounts)` runs while threads are mid-transfer and reads a total that is
missing money currently in flight between a `withdraw` and a `deposit`. It
would sometimes pass, which is worse than always failing.

**Lock ordering.** `synchronized (from) { synchronized (to) { … } }` takes the
locks in whatever order the arguments arrived. A→B and B→A running at once is
the chapter's deadlock exactly, and 20,000 random transfers across six accounts
will find it. Sorting by `id()` before locking gives every thread the same
order, and the cycle becomes impossible — not unlikely, impossible. This is why
`Account` has an id at all: a total order over the locks is a *requirement*,
and something has to provide it.

**Check outside the lock.** Validating the balance before entering
`synchronized` — or not validating it at all, as the starter does not — lets
two threads both see enough money and both withdraw it. The check belongs
inside, next to the mutation it guards, which is the general rule: a check and
the action it authorises must be inside the same critical section.

**Unguarded reads.** `balance()` returning the field without the lock has no
visibility guarantee, and for a `long` it is worse than that — the memory model
does not promise that a non-volatile 64-bit read is even atomic, so in
principle you can read the high half of one write and the low half of another.
In practice every 64-bit JVM makes it atomic; in principle the specification
does not, and `total()` summing unguarded balances is how a "money appeared
from nowhere" report starts.

One thing the solution does **not** do: make `deposit` and `withdraw`
`synchronized` themselves. They are package-private helpers called only with
both locks held, and locking again would be harmless — `synchronized` is
reentrant — but it would suggest they are safe to call alone, which they are
not. Where a method's safety depends on the caller holding a lock, say so, and
keep the method invisible outside the class.
