---
title: "null and Optional"
navTitle: "null and Optional"
summary: >-
  The billion-dollar mistake, the message Java added to make it survivable, and the type that lets a signature admit a value might be missing.
objectives:
  - Read a helpful NullPointerException and say what it names
  - Use Optional to make absence part of a return type
  - Explain why orElse can be wrong and orElseGet right
status: complete
standard: java21
requires: [try-with-resources]
---

Tony Hoare called null references his billion-dollar mistake: he put them into
ALGOL W in 1965 because they were easy to implement, and every language that
copied the idea inherited a value that is assignable to any reference type and
supports no operation at all.

Java cannot remove it. What it has done is make failures easier to diagnose,
and add a type for the case where absence is a legitimate answer.

## The message tells you which one

```java run expect-throw title="Helpful, since Java 14"
public class Main {
    record Address(String city) { }
    record User(String name, Address address) { }

    public static void main(String[] args) {
        User user = new User("Ada", null);

        System.out.println(user.address().city().toUpperCase());
    }
}
```

Three things on that line could be null. The message says which:
*Cannot invoke "Main$Address.city()" because the return value of
"Main$User.address()" is null.*

Before Java 14 it said only `NullPointerException` and a line number, and a
line with three dereferences meant guessing or adding print statements. The
compiler records enough about the expression for the JVM to describe the exact
step that failed.

:::note
This depends on the class file carrying debug information. This site compiles
with `-g`, as Maven and Gradle do by default; without it the message falls back
to naming a slot — `because "<local1>" is null` — which is much less use.
:::

## Absence in the type

A method returning `String` that sometimes returns `null` is lying: its
signature promises a string. `Optional<String>` says the truth.

```java run title="A return type that admits it might have nothing"
import java.util.Optional;

public class Main {
    record User(String name, String nickname) { }

    static Optional<String> nicknameOf(User user) {
        return Optional.ofNullable(user.nickname());
    }

    public static void main(String[] args) {
        User withNickname = new User("Ada", "Countess");
        User without = new User("Grace", null);

        System.out.println(nicknameOf(withNickname).orElse("(none)"));
        System.out.println(nicknameOf(without).orElse("(none)"));

        System.out.println("present? " + nicknameOf(withNickname).isPresent()
                           + " / " + nicknameOf(without).isPresent());

        System.out.println(nicknameOf(withNickname).map(String::toUpperCase).orElse("(none)"));
        System.out.println(nicknameOf(withNickname).filter(n -> n.length() > 20).orElse("(too short)"));
    }
}
```

`Optional.of(x)` requires a non-null `x` and throws if given null;
`Optional.ofNullable(x)` accepts either. `map` transforms the value if there is
one and does nothing if there is not, so a chain of steps needs no null check
between them.

The point is not that `Optional` prevents `NullPointerException` — you can
still call `.get()` on an empty one. The point is that the *signature* forces
the caller to acknowledge the possibility, in the same way chapter 3.2's
checked exception does, and unlike a `String` that is secretly sometimes null.

## orElse evaluates its argument. Always.

```java run title="A fallback that runs when it is not needed"
import java.util.Optional;

public class Main {
    static String expensiveDefault() {
        System.out.println("  ...computing the default...");
        return "computed";
    }

    public static void main(String[] args) {
        Optional<String> present = Optional.of("the actual value");

        System.out.println("orElse on a value that is present:");
        String a = present.orElse(expensiveDefault());
        System.out.println("  result: " + a);

        System.out.println("orElseGet on a value that is present:");
        String b = present.orElseGet(Main::expensiveDefault);
        System.out.println("  result: " + b);
    }
}
```

The first one prints *...computing the default...* even though the value was
there and the default was thrown away.

That is not a quirk of `Optional`; it is how method calls work. `orElse` is an
ordinary method, so its argument is evaluated before it is called — chapter
1.4's rule. `orElseGet` takes a function and calls it only if needed.

The consequence is a real bug class:

- `orElse(0)` or `orElse("")` — a constant. Fine.
- `orElse(loadFromDatabase())` — runs the query every time, including when the
  value was present.
- `orElse(new ArrayList<>())` — allocates on every call. Usually harmless,
  occasionally not.
- `orElseThrow()` — throws `NoSuchElementException`; the overload taking a
  supplier lets you choose the exception.

:::tip
Use `orElse` for a constant and `orElseGet` for anything that does work. The
difference is invisible in testing, because both return the right answer.
:::

## Where Optional does not belong

`Optional` was designed for one job: a **return type** for a method that may
legitimately have no answer. Using it elsewhere is a common and costly mistake.

- **Not as a field.** It adds an object per instance, is not `Serializable`,
  and a field that is sometimes absent is usually a modelling problem — the
  object should either have the value or be a different type.
- **Not as a parameter.** A caller then has to wrap arguments in
  `Optional.of(...)` to call you, and can still pass `null` for the `Optional`
  itself, which is the worst of both. Overload the method instead.
- **Not for collections.** An empty `List` already expresses "nothing here".
  `Optional<List<String>>` makes callers handle two kinds of empty.

```java run title="Chaining rather than unwrapping"
import java.util.Optional;

public class Main {
    record Address(String city) { }
    record User(String name, Address address) { }

    static Optional<Address> addressOf(User user) {
        return Optional.ofNullable(user.address());
    }

    // Unwrapping to check, then unwrapping again — Optional written as if it were null
    static String cityBadly(User user) {
        Optional<Address> maybe = addressOf(user);
        if (maybe.isPresent()) {
            return maybe.get().city();
        }
        return "unknown";
    }

    // Saying what to do with the value, if there is one
    static String cityWell(User user) {
        return addressOf(user)
                .map(Address::city)
                .orElse("unknown");
    }

    public static void main(String[] args) {
        User located = new User("Ada", new Address("London"));
        User unlocated = new User("Grace", null);

        System.out.println(cityBadly(located) + " / " + cityBadly(unlocated));
        System.out.println(cityWell(located) + " / " + cityWell(unlocated));
    }
}
```

Both work. `cityBadly` is `Optional` used as a more expensive `null` — the
`isPresent`/`get` pair is exactly the null check it was meant to replace, with
an allocation added. `cityWell` describes the transformation and lets
`Optional` decide whether it happens.

:::warning
`Optional` is not a null-safety system. A method returning `Optional<String>`
can still return `null` instead of `Optional.empty()`, and every caller will
break in the ordinary way. The type is a statement of intent that the compiler
does not enforce — so never return `null` from a method whose return type is
`Optional`.
:::

:::quiz
{
  "question": "`config.orElse(loadDefaults())` where `config` is a present Optional. What happens?",
  "options": [
    { "text": "loadDefaults() runs, its result is discarded, and the present value is returned", "correct": true, "why": "Right. orElse is an ordinary method, so its argument is evaluated before the call — whether or not the value is needed. orElseGet(Main::loadDefaults) defers it." },
    { "text": "loadDefaults() is skipped because the value is present", "correct": false, "why": "That is orElseGet's behaviour. orElse cannot skip it: the argument has already been computed by the time orElse is entered." },
    { "text": "It throws, because orElse may not be given a method call", "correct": false, "why": "Any expression is allowed. The problem is not legality but that the expression is always evaluated." },
    { "text": "It depends on whether loadDefaults() has side effects", "correct": false, "why": "The call happens either way. Side effects only determine whether you notice." }
  ]
}
:::

## Practice

:::exercise optional-lookup

:::exercise avoid-the-eager-default

:::recap
- A modern `NullPointerException` names the exact step that was null, provided
  the class file carries debug information.
- `Optional` makes absence part of a return type. `of` rejects null,
  `ofNullable` accepts it.
- `map` and `filter` let a chain proceed without intermediate checks;
  `isPresent`/`get` is the null check it replaced, written more expensively.
- `orElse` evaluates its argument every time. Use it for constants and
  `orElseGet` for anything that does work.
- `Optional` is for return types — not fields, not parameters, not
  collections — and never return `null` from a method that returns one.
:::
