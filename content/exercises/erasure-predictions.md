---
id: erasure-predictions
title: "What survives to run time"
difficulty: core
chapter: erasure
topics: [erasure, generics, reflection]
check: unit
standard: java21
---

Write three methods that answer, at run time, what erasure did and did not
remove.

- `sameRuntimeClass(List<?> a, List<?> b)` — whether the two lists have the
  same class at run time.
- `runtimeClassName(List<?> list)` — the fully qualified name of that class.
- `declaredElementType()` — the generic type of the field `NAMES` below, as a
  string.

`NAMES` is given: `static final List<String> NAMES = new ArrayList<>();`

The starter guesses rather than asking.

## Starter
```java
static final List<String> NAMES = new ArrayList<>();

static boolean sameRuntimeClass(List<?> a, List<?> b) {
    return false;
}

static String runtimeClassName(List<?> list) {
    return "java.util.List";
}

static String declaredElementType() {
    return "unknown";
}
```

## Tests
```java
check(sameRuntimeClass(new ArrayList<String>(), new ArrayList<Integer>()));
check(sameRuntimeClass(new ArrayList<String>(), new ArrayList<String>()));
check(!sameRuntimeClass(new ArrayList<String>(), new LinkedList<String>()));

checkEq(runtimeClassName(new ArrayList<String>()), "java.util.ArrayList");
checkEq(runtimeClassName(new LinkedList<Integer>()), "java.util.LinkedList");

checkEq(declaredElementType(), "java.util.List<java.lang.String>");
```

## Hints
- `getClass()` on two lists with different type arguments returns the same
  `Class` object, which is the first check.
- `getClass().getName()` gives the fully qualified name of the *implementation*,
  not the interface.
- The field's generic signature is kept in the class file.
  `Main.class.getDeclaredField("NAMES").getGenericType()` reads it back.
- `getGenericType()` returns a `Type`; its `toString()` is the required text.

## Solution
```java
static final List<String> NAMES = new ArrayList<>();

static boolean sameRuntimeClass(List<?> a, List<?> b) {
    return a.getClass() == b.getClass();
}

static String runtimeClassName(List<?> list) {
    return list.getClass().getName();
}

static String declaredElementType() {
    try {
        return Main.class.getDeclaredField("NAMES").getGenericType().toString();
    } catch (NoSuchFieldException e) {
        throw new IllegalStateException("NAMES field is missing", e);
    }
}
```

## Notes
The three answers together are the chapter in miniature.

`new ArrayList<String>()` and `new ArrayList<Integer>()` have the *same* `Class`
object — one class, compiled once, with the type arguments removed. Comparing
with `==` is right here rather than `equals`, because `Class` objects are
singletons per loaded class.

`getClass()` returns the implementation, so a `List<String>` variable holding an
`ArrayList` reports `java.util.ArrayList`. The declared type of the variable is
a compile-time notion and the object has never heard of it — the same
distinction chapter 2.5 drew between fields and methods, in another guise.

And the third shows what erasure does *not* remove. The field `NAMES` keeps its
full generic signature in the class file, so reflection reads back
`java.util.List<java.lang.String>` — the very information the object itself
cannot supply. An object does not know its type arguments; a declaration does.

That asymmetry is the whole basis of framework binding. A JSON library asked to
fill a `List<Person>` field cannot ask the list what it holds — it reads the
field's signature, exactly as `declaredElementType` does here.

Note the checked `NoSuchFieldException`. Reflection is full of checked
exceptions for conditions that are impossible when the name is a literal in the
same class, which is why wrapping in an unchecked exception at the boundary is
the conventional answer — chapter 3.2's argument, in its most common setting.
