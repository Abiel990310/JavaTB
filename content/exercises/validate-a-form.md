---
id: validate-a-form
title: "Report every problem, not just the first"
difficulty: stretch
chapter: designing-failure
topics: [design, result types, validation]
check: unit
standard: java21
---

Validation is the case an exception handles worst: throwing stops at the first
problem, so a user fixes one field, resubmits, and is told about the next one.

Write `validate(String name, String email, String ageText)` returning a result
that carries **all** the problems at once.

`Validation` is given: `Ok(Registration reg)` or `Errors(List<String>
messages)`, with `record Registration(String name, String email, int age)`.

The rules, and the exact message for each failure, in this order:

1. `name` is null or blank — `name is required`
2. `email` does not contain `@` — `email must contain @`
3. `ageText` is not a number — `age must be a number`
4. otherwise, if the age is below 18 — `must be 18 or over`

Rules 3 and 4 are exclusive: text that will not parse produces only the parse
message. A valid submission returns `Ok` with the parsed registration.

## Starter
```java
sealed interface Validation permits Ok, Errors { }
record Registration(String name, String email, int age) { }
record Ok(Registration reg) implements Validation { }
record Errors(List<String> messages) implements Validation { }

static Validation validate(String name, String email, String ageText) {
    if (name == null || name.isBlank()) {
        throw new IllegalArgumentException("name is required");
    }
    if (!email.contains("@")) {
        throw new IllegalArgumentException("email must contain @");
    }
    return new Ok(new Registration(name, email, Integer.parseInt(ageText)));
}
```

## Tests
```java
checkEq(validate("Ada", "ada@example.com", "36"),
        new Ok(new Registration("Ada", "ada@example.com", 36)));
checkEq(validate("Ada", "ada@example.com", "18"),
        new Ok(new Registration("Ada", "ada@example.com", 18)));

checkEq(validate("", "ada@example.com", "36"),
        new Errors(List.of("name is required")));
checkEq(validate("Ada", "nope", "36"),
        new Errors(List.of("email must contain @")));
checkEq(validate("Ada", "ada@example.com", "abc"),
        new Errors(List.of("age must be a number")));
checkEq(validate("Ada", "ada@example.com", "17"),
        new Errors(List.of("must be 18 or over")));

checkEq(validate("", "nope", "abc"),
        new Errors(List.of("name is required", "email must contain @", "age must be a number")));
checkEq(validate(null, "nope", "12"),
        new Errors(List.of("name is required", "email must contain @", "must be 18 or over")));
checkEq(validate("  ", "ada@example.com", "17"),
        new Errors(List.of("name is required", "must be 18 or over")));
```

## Hints
- Collect into a `List<String>` rather than returning at the first failure.
- Check every rule, then decide at the end: empty list means `Ok`.
- Rules 3 and 4 share a slot — parse inside a `try`, and only range-check when
  the parse succeeded.
- The order of messages in the list matters, and it is the order of the rules.

## Solution
```java
sealed interface Validation permits Ok, Errors { }
record Registration(String name, String email, int age) { }
record Ok(Registration reg) implements Validation { }
record Errors(List<String> messages) implements Validation { }

static Validation validate(String name, String email, String ageText) {
    List<String> problems = new ArrayList<>();

    if (name == null || name.isBlank()) {
        problems.add("name is required");
    }
    if (email == null || !email.contains("@")) {
        problems.add("email must contain @");
    }

    int age = -1;
    boolean ageParsed = false;
    try {
        age = Integer.parseInt(ageText);
        ageParsed = true;
    } catch (NumberFormatException e) {
        problems.add("age must be a number");
    }
    if (ageParsed && age < 18) {
        problems.add("must be 18 or over");
    }

    if (!problems.isEmpty()) {
        return new Errors(problems);
    }
    return new Ok(new Registration(name, email, age));
}
```

## Notes
The starter throws on the first problem, and that is the behaviour the exercise
exists to reject. A form with three mistakes takes three round trips, each one
revealing exactly one more thing wrong — which is a familiar and thoroughly
unpleasant experience, and it is a direct consequence of choosing a mechanism
that can only carry one failure and stops the method dead.

Collecting is only possible because the result is a *value*. An exception
propagates immediately by design; that is its whole nature, and it is exactly
right when the caller cannot continue. Here the caller can continue — indeed
must, to find the other problems — so the failure has to be something the
method can hold onto and add to.

The `ageParsed` flag is doing real work. Without it, unparseable text would
produce both `age must be a number` and `must be 18 or over`, because the
uninitialised `age` would fail the range check too. The checks pin this down:
`validate("Ada", "ada@example.com", "abc")` expects exactly one message. A
sentinel of `-1` cannot express "no value" here for the reason chapter 1.2's
`second-largest` gave — though in this case any negative sentinel would fail
the range check and produce the same wrong extra message.

Real validation libraries generalise this into an *applicative* — a way of
combining several independent checks so their failures accumulate rather than
short-circuit. That is what this method is doing by hand, and it is worth
recognising the shape: independent checks, each producing either a value or a
complaint, combined so that complaints gather.
