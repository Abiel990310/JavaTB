---
id: extend-the-account
title: "A savings account built on an account"
difficulty: core
chapter: inheritance
topics: [inheritance, overriding]
check: unit
standard: java21
---

`Account` below tracks a balance in pence. Write `SavingsAccount` extending it,
adding interest.

- Its constructor takes an opening balance and an interest rate in basis points
  (hundredths of a percent, so 250 means 2.5%).
- `rate()` returns the rate.
- `addInterest()` adds `balance * rate / 10000` pence, rounded down, to the
  balance — by calling `deposit`, not by touching the field.
- `describe()` overrides the parent's to return `"savings at N bp"`, with the
  rate in place of N.

`Account`'s `pence` field is private, so a subclass cannot reach it. That is
deliberate: the subclass has to go through the operations the parent offers,
which is what keeps the parent's invariant intact.

## Starter
```java
static class Account {
    private long pence;

    Account(long opening) {
        if (opening < 0) {
            throw new IllegalArgumentException("negative opening balance");
        }
        this.pence = opening;
    }

    long balance() {
        return pence;
    }

    void deposit(long amount) {
        if (amount < 0) {
            throw new IllegalArgumentException("negative deposit");
        }
        pence += amount;
    }

    String describe() {
        return "account";
    }
}

static class SavingsAccount extends Account {
    SavingsAccount(long opening, int rateBasisPoints) {
        super(opening);
    }
}
```

## Tests
```java
SavingsAccount s = new SavingsAccount(100_000, 250);
checkEq(s.balance(), 100_000);
checkEq(s.rate(), 250);
checkEq(s.describe(), "savings at 250 bp");

s.addInterest();
checkEq(s.balance(), 102_500);

s.addInterest();
checkEq(s.balance(), 105_062);

SavingsAccount zero = new SavingsAccount(0, 500);
zero.addInterest();
checkEq(zero.balance(), 0);

SavingsAccount noRate = new SavingsAccount(1000, 0);
noRate.addInterest();
checkEq(noRate.balance(), 1000);

Account viewedAsAccount = s;
checkEq(viewedAsAccount.describe(), "savings at 250 bp");
```

## Hints
- The subclass needs a field of its own for the rate, assigned after
  `super(...)`.
- Interest is `balance() * rate / 10000`. Integer division truncates, which is
  the rounding down the specification asks for.
- `addInterest` must call `deposit`, so the parent's check still runs.
- The last check views the object through an `Account` variable. Methods
  dispatch on the actual type, so an override is found either way — but only if
  it really is an override.

## Solution
```java
static class Account {
    private long pence;

    Account(long opening) {
        if (opening < 0) {
            throw new IllegalArgumentException("negative opening balance");
        }
        this.pence = opening;
    }

    long balance() {
        return pence;
    }

    void deposit(long amount) {
        if (amount < 0) {
            throw new IllegalArgumentException("negative deposit");
        }
        pence += amount;
    }

    String describe() {
        return "account";
    }
}

static class SavingsAccount extends Account {
    private final int rateBasisPoints;

    SavingsAccount(long opening, int rateBasisPoints) {
        super(opening);
        this.rateBasisPoints = rateBasisPoints;
    }

    int rate() {
        return rateBasisPoints;
    }

    void addInterest() {
        deposit(balance() * rateBasisPoints / 10_000);
    }

    @Override
    String describe() {
        return "savings at " + rateBasisPoints + " bp";
    }
}
```

## Notes
The second `addInterest` is the interesting check: 102,500 at 2.5% gives
2,562.5 pence, and integer division truncates it to 2,562, landing on 105,062
rather than 105,062.5. Compounding on truncated values is exactly how real
interest is calculated, and doing the arithmetic in `long` pence rather than
`double` pounds is what makes the answer reproducible — chapter 1.2's rule,
still paying off.

`addInterest` calls `deposit` rather than assigning a field, and it could not
do otherwise: `pence` is `private`, so it is invisible to the subclass. That is
`private` doing its job in a way chapter 2.3 described — the parent's rule that
a deposit is never negative applies to every route into the balance, including
the ones added by classes written later.

Some codebases would make `pence` `protected` so subclasses can touch it
directly. Resist it. `protected` means the invariant is now maintained by every
subclass anyone ever writes, and you cannot see them all.

The final check exists to catch an override that is not one. `describe()`
declared with a different name, a different signature, or shadowed by a static
method would still satisfy the earlier checks when called through a
`SavingsAccount` variable, and would fall back to `"account"` when called
through an `Account` variable.
