---
title: "API design in Java"
navTitle: "API design"
summary: >-
  Make the right call easy and the wrong call impossible — and remember that everything public is a promise you cannot take back.
objectives:
  - Choose between a constructor, a static factory and a builder
  - Avoid overloads that resolve in ways nobody predicts
  - Design signatures that fail at compile time rather than at run time
  - Say what you can and cannot change after release
status: complete
standard: java21
requires: [measuring]
---

An API is the part of your code other people write against, and the part you
cannot change afterwards. Everything else can be refactored; this cannot.

The whole subject reduces to two questions. *Is the correct call the easy one?*
And *does the wrong call fail now, or in production?*

## Constructors, factories, builders

A constructor is fine when there is one obvious way to build the thing and its
arguments are unambiguous. Past that, a **static factory** buys you three
things a constructor cannot have: a name, the freedom to return a subtype or a
cached instance, and the ability to decline.

```java run title="A name is worth having"
import java.time.*;
import java.util.*;

public class Main {
    record Money(String currency, long minorUnits) {
        Money {
            Objects.requireNonNull(currency, "currency");
            if (currency.length() != 3) {
                throw new IllegalArgumentException("currency must be 3 letters: " + currency);
            }
        }

        static Money ofMinorUnits(String currency, long minorUnits) {
            return new Money(currency, minorUnits);
        }

        static Money ofMajorUnits(String currency, long majorUnits) {
            return new Money(currency, majorUnits * 100);
        }

        static Money zero(String currency) {
            return new Money(currency, 0);
        }

        @Override
        public String toString() {
            return currency + " " + minorUnits / 100 + "." + String.format("%02d", Math.abs(minorUnits % 100));
        }
    }

    public static void main(String[] args) {
        System.out.println(Money.ofMajorUnits("GBP", 12));
        System.out.println(Money.ofMinorUnits("GBP", 1_250));
        System.out.println(Money.zero("EUR"));

        try {
            Money.ofMinorUnits("POUNDS", 1);
        } catch (IllegalArgumentException refused) {
            System.out.println("refused: " + refused.getMessage());
        }
    }
}
```

`new Money("GBP", 12)` is ambiguous — twelve pounds or twelve pence? — and no
amount of documentation fixes a call site that reads `new Money("GBP", 12)`.
`Money.ofMajorUnits("GBP", 12)` reads correctly at the call site, which is the
only place it matters.

The JDK's naming conventions are worth following because readers already know
them: **`of`** for a straightforward factory (`List.of`, `Optional.of`),
**`from`** for a conversion (`Instant.from`), **`valueOf`** for a
representation change (`Integer.valueOf`), **`getInstance`** for something
managed, and **`copyOf`** for a defensive copy (`List.copyOf`).

Note the compact constructor doing the validation. Chapter 2.9's rule applies
to every API: **an object that exists is valid**. Validating at construction
means no method afterwards has to wonder.

When there are more than three or four parameters, and especially when most
are optional, use a **builder**:

```java run title="Named, optional, validated once"
public class Main {
    static final class HttpRequest {
        private final String method;
        private final String url;
        private final int timeoutMillis;
        private final boolean followRedirects;

        private HttpRequest(Builder builder) {
            this.method = builder.method;
            this.url = builder.url;
            this.timeoutMillis = builder.timeoutMillis;
            this.followRedirects = builder.followRedirects;
        }

        static Builder to(String url) {
            return new Builder(url);
        }

        @Override
        public String toString() {
            return method + " " + url + " (timeout " + timeoutMillis + "ms, redirects "
                + followRedirects + ")";
        }

        static final class Builder {
            private final String url;
            private String method = "GET";
            private int timeoutMillis = 30_000;
            private boolean followRedirects = true;

            private Builder(String url) {
                if (url == null || url.isBlank()) {
                    throw new IllegalArgumentException("url must not be blank");
                }
                this.url = url;
            }

            Builder method(String method) {
                this.method = method;
                return this;
            }

            Builder timeout(int millis) {
                if (millis <= 0) {
                    throw new IllegalArgumentException("timeout must be positive: " + millis);
                }
                this.timeoutMillis = millis;
                return this;
            }

            Builder followRedirects(boolean follow) {
                this.followRedirects = follow;
                return this;
            }

            HttpRequest build() {
                return new HttpRequest(this);
            }
        }
    }

    public static void main(String[] args) {
        System.out.println(HttpRequest.to("https://example.test").build());
        System.out.println(HttpRequest.to("https://example.test")
            .method("POST")
            .timeout(5_000)
            .followRedirects(false)
            .build());

        try {
            HttpRequest.to("https://example.test").timeout(-1);
        } catch (IllegalArgumentException refused) {
            System.out.println("refused: " + refused.getMessage());
        }
    }
}
```

The alternative — a constructor taking `(String, String, int, boolean)` — is a
call site reading `new HttpRequest("POST", url, 5000, false)`, where every
argument is guessable and none is checkable. The compiler cannot tell you that
you swapped the two strings.

Two rules for builders. Put the **required** arguments on the factory that
creates the builder, so they cannot be forgotten. And validate each setter as
it is called, so the exception names the value you got wrong rather than
appearing at `build()` with everything to choose from.

## Overloads that surprise people

```java run title="The most famous bad overload in the JDK"
import java.util.*;

public class Main {
    static String describe(Object value) {
        return "Object";
    }

    static String describe(String value) {
        return "String";
    }

    static int count(String... parts) {
        return parts == null ? -1 : parts.length;
    }

    public static void main(String[] args) {
        List<Integer> byIndex = new ArrayList<>(List.of(10, 20, 30));
        byIndex.remove(1);
        List<Integer> byValue = new ArrayList<>(List.of(10, 20, 30));
        byValue.remove(Integer.valueOf(10));
        System.out.println("remove(1)                   -> " + byIndex);
        System.out.println("remove(Integer.valueOf(10)) -> " + byValue);

        System.out.println("describe(null)          -> " + describe(null));
        System.out.println("describe((Object) null) -> " + describe((Object) null));

        System.out.println("count()                 -> " + count());
        System.out.println("count(\"a\")              -> " + count("a"));
        System.out.println("count((String) null)    -> " + count((String) null));
        System.out.println("count((String[]) null)  -> " + count((String[]) null));
    }
}
```

`List` has both `remove(int)` and `remove(Object)`, so `remove(1)` removes
*position* one and `remove(Integer.valueOf(10))` removes the *value* ten. Both
compile, both are sensible-looking, and they do entirely different things.
`List` is stuck with it forever; you are not.

`describe(null)` picks the `String` overload, because overload resolution
prefers the **most specific** applicable method and `null` is applicable to
both. Add a third overload taking `Integer` and the same call stops compiling —
now neither is more specific. A call site whose meaning changes when you add an
unrelated method is not a call site anyone can reason about.

The varargs pair at the end is the one that catches people at run time.
`count((String) null)` passes an array of one null element; `count((String[])
null)` passes a null array. Same word at the call site, and a varargs method
that does not check for `null` throws a `NullPointerException` on
`parts.length` when someone writes `count(null)`.

The rules that follow:

- **Do not overload on the number of arguments alone if the types can be
  confused.** Give the methods different names — `removeAt(int)` and
  `removeValue(T)` — and the ambiguity disappears.
- **Never overload where one parameter type is a subtype of another** unless
  both overloads do the same thing.
- **Prefer distinct names to clever resolution.** `writeInt`, `writeLong`,
  `writeString` is uglier than `write` and never surprises anyone.

## Types that make wrong calls impossible

```java run title="Let the compiler do the checking"
import java.util.*;

public class Main {
    sealed interface Shape permits Circle, Square, Triangle {}
    record Circle(double radius) implements Shape {}
    record Square(double side) implements Shape {}
    record Triangle(double base, double height) implements Shape {}

    // No default branch: the compiler proves every case is handled, so adding
    // a fourth shape breaks this method at compile time rather than at run time.
    static double area(Shape shape) {
        return switch (shape) {
            case Circle circle -> Math.PI * circle.radius() * circle.radius();
            case Square square -> square.side() * square.side();
            case Triangle triangle -> triangle.base() * triangle.height() / 2;
        };
    }

    // Accept the most general type that works; return the most specific
    // useful one.
    static List<String> namesOf(Collection<? extends Shape> shapes) {
        List<String> names = new ArrayList<>(shapes.size());
        for (Shape shape : shapes) {
            names.add(shape.getClass().getSimpleName());
        }
        return List.copyOf(names);
    }

    static Optional<Shape> largest(Collection<? extends Shape> shapes) {
        Shape best = null;
        for (Shape shape : shapes) {
            if (best == null || area(shape) > area(best)) {
                best = shape;
            }
        }
        return Optional.ofNullable(best);
    }

    public static void main(String[] args) {
        List<Shape> shapes = List.of(new Circle(1), new Square(2), new Triangle(3, 4));

        System.out.printf("areas: %.2f %.2f %.2f%n",
            area(shapes.get(0)), area(shapes.get(1)), area(shapes.get(2)));
        System.out.println("names: " + namesOf(shapes));
        System.out.println("names accepts a Set too: " + namesOf(new LinkedHashSet<>(shapes)));
        System.out.println("largest: " + largest(shapes).map(Object::getClass).map(Class::getSimpleName));
        System.out.println("largest of nothing: " + largest(List.of()));
    }
}
```

Three separate design decisions in one program.

**A sealed interface with an exhaustive switch and no `default`.** Chapter
2.11's sealed types earn their keep here: add a fourth `Shape` and every
`switch` like this one stops compiling, with a message naming the case you
forgot. A `default -> throw new IllegalArgumentException(...)` would have
compiled and failed in production instead.

**Accept `Collection<? extends Shape>`, return `List<String>`.** The parameter
takes anything the method can actually use — a `List`, a `Set`, a
`List<Circle>`. The return type is specific enough to be useful: returning
`Collection<String>` would force every caller to convert before indexing.
"Be liberal in what you accept and specific in what you return."

**Return `Optional<Shape>`, not `null`.** A method that can find nothing should
say so in its type. The caller cannot forget, because the compiler will not let
them call `Shape` methods on an `Optional`.

But `Optional` belongs in exactly one place — **a return type**. Not a
parameter (write an overload, or accept `null` and document it), not a field
(it is not serialisable and it costs an allocation per instance), and not a
collection element (an empty list already means what you want).

## What you cannot change afterwards

Once code is released, some changes break the people using it. The important
distinction is *when* they find out.

| Change | Source compatible | Binary compatible |
|---|---|---|
| Add a method to a class | yes | yes |
| Add an **abstract** method to an interface | **no** | no |
| Add a `default` method to an interface | yes* | yes |
| Add a constant to an enum | yes* | yes |
| Add a permitted subtype to a sealed interface | **no** | no |
| Widen a parameter type (`String` to `CharSequence`) | yes | **no** |
| Rename a parameter | yes | yes |
| Change a `public static final String` constant | yes | **yes, and wrong** |

The starred rows are the interesting ones. Adding a `default` method compiles
for every implementer — unless one of them already has a method with that name
and an incompatible signature, or implements two interfaces that now both
provide it. Adding an enum constant compiles for every consumer — unless one
of them has an exhaustive switch, which is exactly the safety you were hoping
for and exactly what makes the change breaking.

The last row is chapter 7.3's compile-time constant, and it is the one that
surprises people most: changing `public static final String VERSION = "1.0"`
to `"2.0"` recompiles cleanly and links cleanly, and every class compiled
against the old value keeps printing `"1.0"` until *it* is recompiled. The
change is binary compatible and silently wrong, which is worse than an error.

Widening a parameter type is the mirror image: every caller's *source* still
compiles, and every already-compiled caller fails with `NoSuchMethodError`,
because the method descriptor in the bytecode names the old type exactly.

The practical advice:

- **Make everything as private as it will go**, and open it later. Going the
  other way is impossible.
- **`final` by default** for classes you did not design to be extended
  (chapter 2.11's argument, restated as an API rule).
- **Interfaces you expect to evolve need `default` methods** planned for, or a
  companion abstract class, or acceptance that you will break people.
- **Do not publish a constant you might change.** Publish a method.

## Errors at the boundary

An API's exceptions are part of its signature, and chapter 3.2's rule applies
with more force here: throw **unchecked** for programming errors the caller
could have prevented — a null argument, a negative size, a malformed pattern —
and **checked** only for conditions a careful caller must still handle, such as
a file that has gone away.

Two habits worth keeping:

**Say what was wrong, with the value.** `"timeout must be positive: -1"` beats
`"invalid argument"` by exactly the amount of time someone would otherwise
spend finding out which argument.

**Validate at the boundary, once.** A public method checks its inputs; the
private methods it calls do not, because they cannot be reached with bad ones.
Checking everywhere is noise; checking nowhere is a `NullPointerException`
three frames deep in code the caller has never seen.

:::quiz
{
  "question": "You release a library with `public static final String DEFAULT_HOST = \"localhost\"`. In version 2 you change it to `\"127.0.0.1\"`. Applications upgrade the jar without recompiling. What do they see?",
  "options": [
    { "text": "`\"localhost\"` — javac inlined the old value into every class that read it, so the field is never read at run time", "correct": true, "why": "Right. It is a compile-time constant, so the change is binary compatible and silently ineffective until every consumer recompiles." },
    { "text": "`\"127.0.0.1\"` — the field is read from the new jar at run time", "correct": false, "why": "That is true for a non-constant field, such as one initialised by a method call, but not for a String initialised with a literal." },
    { "text": "`NoSuchFieldError`, because the constant's value changed", "correct": false, "why": "The field still exists with the same name and type; nothing about the link fails." },
    { "text": "It depends on whether the field is `static`", "correct": false, "why": "Inlining depends on the field being `final` with a constant initialiser of a primitive or String type, not on `static` alone." }
  ]
}
:::

## Practice

:::exercise design-the-api

:::exercise breaking-changes

:::recap
- A static factory has a name, may return a subtype or a cached instance, and
  may decline. Follow the JDK's `of` / `from` / `valueOf` / `copyOf`
  conventions.
- Use a builder past three or four parameters; put the required ones on the
  factory that makes the builder, and validate each setter as it is called.
- `List.remove(int)` against `remove(Object)` is the warning: never overload
  where the types can be confused, and prefer distinct names.
- `describe(null)` picks the most specific overload, and adding an unrelated
  overload can make the same call ambiguous.
- `count(null)` on a varargs method passes a **null array**, not one null
  element.
- Sealed types plus an exhaustive `switch` with no `default` move a missed case
  from run time to compile time.
- Accept the most general parameter type that works; return the most specific
  useful one. `Optional` is for return types only.
- Adding an abstract interface method, adding a sealed subtype, and widening a
  parameter type all break someone. Changing a published `static final`
  constant breaks them *silently*.
- Make everything as private as it will go; you can open it later, never close
  it.
