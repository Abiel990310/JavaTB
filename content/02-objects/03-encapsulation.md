---
title: "Encapsulation"
navTitle: "Encapsulation"
summary: >-
  Access levels as a tool rather than a ritual: deciding what a class promises, and writing methods that cannot leave it in a state it promised never to be in.
objectives:
  - Choose an access level and say what it actually protects
  - Establish an invariant in a constructor and preserve it in every method
  - Say why a getter and setter for every field is not encapsulation
status: complete
standard: java21
requires: [aliasing]
---

Chapter 2.2 ended somewhere uncomfortable: `private` did not stop anybody
changing the array. It is worth being precise about what it does do, because
the conclusion is not that access levels are useless — it is that they protect
something narrower and more valuable than people assume.

`private` controls **which code can mention a name**. That is all. It does not
follow references, it does not copy anything, and it does not travel with an
object. What it buys you is that every change to a field happens in code you
wrote, in one file, which is what makes it possible to promise anything about
that field at all.

## An invariant is a promise

```java run title="A class that cannot go negative"
class Account {
    private long pence;

    Account(long opening) {
        if (opening < 0) {
            throw new IllegalArgumentException("opening balance cannot be negative: " + opening);
        }
        this.pence = opening;
    }

    long balance() {
        return pence;
    }

    void deposit(long amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("deposit must be positive: " + amount);
        }
        pence += amount;
    }

    boolean withdraw(long amount) {
        if (amount <= 0 || amount > pence) {
            return false;
        }
        pence -= amount;
        return true;
    }
}

public class Main {
    public static void main(String[] args) {
        Account acc = new Account(1000);
        acc.deposit(500);
        System.out.println("balance " + acc.balance());

        System.out.println("withdraw 2000 -> " + acc.withdraw(2000) + ", balance still " + acc.balance());

        try {
            new Account(-5);
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }
    }
}
```

The promise this class makes is: **a balance is never negative.** Three pieces
of code could break it — the constructor and the two mutators — and each of
them checks. Because `pence` is private, those three are the *only* pieces of
code that could break it, and that is what makes the promise checkable at all.
Make the field public and the promise becomes a hope.

That is the whole idea. An **invariant** is something true of an object from
the moment its constructor finishes until it is collected. Encapsulation is the
mechanism that makes an invariant enforceable: establish it in the constructor,
and let no method leave the object in a state that violates it.

:::note
`Account` is a second top-level class in the same file. Java allows any number
of those as long as only one is `public`, and it is how these samples show one
class being unable to reach another's privates — a nested class could not,
since nesting grants access to the enclosing class's members.
:::

## What each level means

| Modifier | Reachable from |
|---|---|
| `private` | inside the same top-level class only |
| *(none)* | any class in the same package — "package-private" |
| `protected` | the same package, plus subclasses anywhere |
| `public` | everywhere |

```java run expect-error title="private really does stop the name"
class Account {
    private long pence = 500;
}

public class Main {
    public static void main(String[] args) {
        Account acc = new Account();
        System.out.println(acc.pence);
    }
}
```

*pence has private access in Account.* Note what the compiler protected: the
**name**. Chapter 2.2's array escaped not because `private` failed but because
a method handed out the reference, and once it is out it is an ordinary
reference like any other.

The default — no modifier at all — is package-private, and it is a genuinely
useful level that people forget exists. Classes that collaborate closely can
live in one package and see each other's internals without exposing them to the
world. `protected` is narrower than it looks and is best deferred until
inheritance, in chapter 2.5.

The rule of thumb: **start private, and widen only when something concrete
needs it.** Widening later is easy; narrowing later means finding every caller.

## Getters and setters are not the point

```java run title="Two classes with identical fields and different promises"
class Exposed {
    public int hour;          // 0-23, allegedly
}

class Guarded {
    private int hour;

    void setHour(int hour) {
        if (hour < 0 || hour > 23) {
            throw new IllegalArgumentException("hour out of range: " + hour);
        }
        this.hour = hour;
    }

    int getHour() {
        return hour;
    }
}

public class Main {
    public static void main(String[] args) {
        Exposed e = new Exposed();
        e.hour = 99;
        System.out.println("exposed accepted " + e.hour);

        Guarded g = new Guarded();
        g.setHour(9);
        System.out.println("guarded accepted " + g.getHour());
        try {
            g.setHour(99);
        } catch (IllegalArgumentException ex) {
            System.out.println("guarded rejected: " + ex.getMessage());
        }
    }
}
```

A setter that only assigns is a public field with more typing. It is not
*wrong* — it leaves room to add a check later without changing callers — but a
class whose every field has a matching getter and setter has encapsulated
nothing. The fields are still public; there is just a longer route to them.

Encapsulation is about which **operations** a type offers, not about routing
field access through methods. `withdraw(amount)` is an operation: it expresses
something the domain does and it can refuse. `setBalance(long)` is not; it
hands the caller the field and asks them to be careful.

:::tip
When you find yourself writing a getter and a setter for a field, ask what the
caller is going to *do* with the value. Very often the answer is an operation
that belongs on the class — and moving it there deletes both accessors and puts
the rule in one place instead of every call site.
:::

## Refusing, loudly or quietly

The `Account` above rejects a bad deposit by throwing and a bad withdrawal by
returning `false`. That is a deliberate split, and it is worth being able to
justify:

- **Throw when the caller made a mistake.** A negative deposit is not a
  situation, it is a bug in the calling code. Failing loudly puts a stack trace
  at the line responsible.
- **Return a value when refusal is a normal outcome.** Trying to withdraw more
  than the balance is something users do all day. It is an answer, not an error,
  and the caller is expected to handle it.

Getting this backwards is a common design mistake in both directions: an
exception for an everyday outcome forces callers to write `try`/`catch` around
ordinary control flow, and a `false` for a programming error lets the bug travel
somewhere else before it surfaces. Chapter 3.5 comes back to this properly.

:::warning
An invariant that the constructor establishes can still be broken later by a
method that forgets to check — and by the escaping references of chapter 2.2. A
class that validates a `Date` in its constructor and then hands the same
mutable `Date` out of a getter has an invariant that holds for exactly as long
as nobody looks at it.
:::

:::quiz
{
  "question": "A class has `private int size` with `getSize()` and `setSize(int)` that only assigns. What has encapsulation achieved here?",
  "options": [
    { "text": "Almost nothing — it is a public field reached through two methods", "correct": true, "why": "Right. Any value can still be stored from anywhere. The one real gain is that a check could be added later without changing callers, which is a reason to keep the option, not an achievement in itself." },
    { "text": "The field is now protected from outside modification", "correct": false, "why": "setSize accepts anything from anyone. The route is longer; the access is identical." },
    { "text": "The class now has an invariant", "correct": false, "why": "An invariant is something guaranteed true of every instance. Nothing here guarantees anything about size — the setter enforces no rule." },
    { "text": "Other classes can no longer read the value", "correct": false, "why": "getSize() returns it to anyone who asks. Reading was never the problem; unchecked writing was." }
  ]
}
:::

## Practice

:::exercise clamped-volume

:::exercise validated-fraction

:::recap
- `private` controls which code may mention a name. It does not follow
  references, which is why chapter 2.2's array escaped despite it.
- Its value is that every write to a field happens in one file, which is what
  makes an invariant enforceable rather than merely intended.
- Establish an invariant in the constructor and preserve it in every method
  that mutates.
- Start private and widen deliberately. Package-private is a real level and is
  often the right one for classes that collaborate closely.
- A getter and setter for every field encapsulates nothing. Prefer operations
  that express what the type does and can refuse.
- Throw when the caller made a programming mistake; return a value when refusal
  is a normal outcome.
:::
