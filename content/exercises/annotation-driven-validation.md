---
id: annotation-driven-validation
title: "Validation from annotations"
difficulty: core
chapter: reflection
topics: [reflection, annotations, validation]
check: unit
standard: java21
---

Build the reflective half of a validation framework: annotations on fields, and
one method that reads them off any object at all.

Three annotations, all `RUNTIME` and all on fields:

- `@NotNull` — the field must not be null
- `@Length(min = …, max = …)` — a `String` field's length, `min` defaulting to
  0 and `max` to `Integer.MAX_VALUE`; a null value is *not* a length problem
- `@Positive` — an `int` or `long` field must be greater than zero

Then:

- `static List<String> validate(Object subject)` — every problem found, as
  `"<fieldName>: <message>"`, with fields visited in **alphabetical order** so
  the output is stable. Messages are exactly `"must not be null"`,
  `"length must be at least N"`, `"length must be at most N"` and
  `"must be positive"`.
- A field carrying no annotation is ignored; a field may carry several.
- Private fields must be readable.

## Starter
```java
import java.lang.annotation.*;
import java.lang.reflect.*;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
@interface NotNull {
}

@Retention(RetentionPolicy.CLASS)
@Target(ElementType.FIELD)
@interface Length {
    int min() default 0;
    int max() default Integer.MAX_VALUE;
}

@Target(ElementType.FIELD)
@interface Positive {
}

static List<String> validate(Object subject) {
    List<String> problems = new ArrayList<>();
    for (Field field : subject.getClass().getDeclaredFields()) {
        if (field.getAnnotation(NotNull.class) != null) {
            try {
                if (field.get(subject) == null) {
                    problems.add(field.getName() + ": must not be null");
                }
            } catch (IllegalAccessException e) {
                throw new RuntimeException(e);
            }
        }
    }
    return problems;
}
```

## Tests
```java
import java.lang.reflect.Field;

class Form {
    @NotNull @Length(min = 2, max = 5) private String name;
    @NotNull private String email;
    @Positive private int age;
    @Length(max = 3) private String code;
    private String ignored;

    Form(String name, String email, int age, String code, String ignored) {
        this.name = name;
        this.email = email;
        this.age = age;
        this.code = code;
        this.ignored = ignored;
    }
}

checkEq(validate(new Form("ada", "a@b", 30, "xy", "anything at all")), List.of());

checkEq(validate(new Form(null, "a@b", 30, "xy", null)),
        List.of("name: must not be null"));

checkEq(validate(new Form("a", "a@b", 30, "xy", null)),
        List.of("name: length must be at least 2"));

checkEq(validate(new Form("abcdef", "a@b", 30, "xy", null)),
        List.of("name: length must be at most 5"));

checkEq(validate(new Form("ada", null, 0, "toolong", null)),
        List.of("age: must be positive",
                "code: length must be at most 3",
                "email: must not be null"));

checkEq(validate(new Form("ada", "a@b", -1, "xy", null)),
        List.of("age: must be positive"));

// A class with no annotated fields at all.
class Plain {
    private String anything = "fine";
}
checkEq(validate(new Plain()), List.of());

// Long fields count too, and a long field is checked the same way.
class Money {
    @Positive private long cents;

    Money(long cents) {
        this.cents = cents;
    }
}
checkEq(validate(new Money(5)), List.of());
checkEq(validate(new Money(0)), List.of("cents: must be positive"));
```

## Hints
- Two of the three annotations in the starter cannot be seen at run time. Look
  at their `@Retention` — and at the one that has none, whose default is not
  what you want.
- `getDeclaredFields()` returns fields in unspecified order. Sort by
  `Field::getName` before looping, or the multi-problem test will fail
  intermittently.
- `field.setAccessible(true)` before `field.get(subject)`, or a private field
  throws `IllegalAccessException`.
- A `@Length` check on a null value should report nothing — `@NotNull` is the
  annotation whose job that is. Doing both would report two problems for one
  mistake.
- `field.get` on an `int` field returns a boxed `Integer`, and on a `long` a
  `Long`. `((Number) value).longValue()` handles both.
- A field can carry `@NotNull` *and* `@Length`; check every annotation on every
  field rather than stopping at the first.

## Solution
```java
import java.lang.annotation.*;
import java.lang.reflect.*;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
@interface NotNull {
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
@interface Length {
    int min() default 0;
    int max() default Integer.MAX_VALUE;
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
@interface Positive {
}

static List<String> validate(Object subject) {
    Field[] fields = subject.getClass().getDeclaredFields();
    Arrays.sort(fields, Comparator.comparing(Field::getName));

    List<String> problems = new ArrayList<>();
    for (Field field : fields) {
        field.setAccessible(true);
        Object value;
        try {
            value = field.get(subject);
        } catch (IllegalAccessException refused) {
            throw new IllegalStateException("cannot read " + field.getName(), refused);
        }

        if (field.isAnnotationPresent(NotNull.class) && value == null) {
            problems.add(field.getName() + ": must not be null");
        }

        Length length = field.getAnnotation(Length.class);
        if (length != null && value instanceof String text) {
            if (text.length() < length.min()) {
                problems.add(field.getName() + ": length must be at least " + length.min());
            }
            if (text.length() > length.max()) {
                problems.add(field.getName() + ": length must be at most " + length.max());
            }
        }

        if (field.isAnnotationPresent(Positive.class)
                && value instanceof Number number
                && number.longValue() <= 0) {
            problems.add(field.getName() + ": must be positive");
        }
    }
    return List.copyOf(problems);
}
```

## Notes
The starter's real bug is in the annotation declarations, not in `validate`.
`@Length` is `RetentionPolicy.CLASS` and `@Positive` has no `@Retention` at all
— and the default is `CLASS`. Both are written into the class file and neither
is loaded, so `getAnnotation` returns `null` and the checks silently do
nothing. Nothing fails to compile, nothing warns, and the framework simply
finds no rules. This is the single most common bug in a hand-rolled annotation
framework, and the reason the chapter says it is worth an afternoon.

The sort is the other thing that is not optional. `getDeclaredFields()` is
documented as returning fields in no particular order, and in practice it often
matches declaration order — often enough that the multi-problem test would pass
on your machine and fail on someone else's JVM. Sorting by name makes the
output a specification rather than an accident.

Note where `setAccessible(true)` sits: on the field, before reading, for every
field. It is required for a private field and harmless for a public one. And
note what happens if it were refused — this code turns `IllegalAccessException`
into an unchecked exception naming the field, because a validator that cannot
read a field has no useful partial answer to give.

The null interaction is a design decision worth making deliberately. `@Length`
skips a null value entirely, so `@NotNull @Length(min = 2)` on a null field
reports exactly one problem. The alternative — every annotation reporting
independently — gives a user two error messages for one empty box, which is
the behaviour `composable-validation` in chapter 6.1 argued against for the
same reason.

`instanceof Number number` covers `int`, `long`, `short` and `byte` fields in
one pattern, because `field.get` boxes a primitive on the way out. That is
erasure working in your favour for once: the reflective API has to speak in
`Object`, so the boxing that chapter 5.4 complained about is what makes one
branch handle every numeric type.
