---
id: type-token-factory
title: "Passing the type as a value"
difficulty: stretch
chapter: the-limits
topics: [generics, erasure, type-token, reflection]
check: unit
standard: java21
---

`T` does not exist at run time, so `new T[n]`, `new T()` and `x instanceof T`
are all impossible. The standard escape is a **type token**: take a
`Class<T>` parameter, so the type arrives as an ordinary value that survives
erasure.

Write three static methods that use one:

- `static <T> T[] newArray(Class<T> type, int length)` — a genuine `T[]`,
  not an `Object[]` in disguise
- `static <T> T[] repeat(Class<T> type, int count, Supplier<T> maker)` — an
  array of `count` elements, each from a separate call to `maker`
- `static <T> List<T> instancesOf(Class<T> type, List<?> values)` — the
  elements of `values` that are instances of `type`, in order, as a `List<T>`
  with no unchecked cast anywhere

`java.lang.reflect.Array.newInstance(Class<?>, int)` builds an array whose
component type is decided at run time. It returns `Object`, so one cast is
needed — and that cast is safe, because you just told it the component type.
`Class` also has `isInstance` and `cast`, which are the run-time forms of
`instanceof` and `(T)`.

## Starter
```java
static <T> T[] newArray(Class<T> type, int length) {
    @SuppressWarnings("unchecked")
    T[] array = (T[]) new Object[length];
    return array;
}

static <T> T[] repeat(Class<T> type, int count, Supplier<T> maker) {
    T[] array = newArray(type, count);
    Arrays.fill(array, maker.get());
    return array;
}

static <T> List<T> instancesOf(Class<T> type, List<?> values) {
    List<T> found = new ArrayList<>();
    for (Object value : values) {
        @SuppressWarnings("unchecked")
        T item = (T) value;
        found.add(item);
    }
    return found;
}
```

## Tests
```java
String[] names = newArray(String.class, 3);
checkEq(names.length, 3);
checkEq(names[0], null);
checkEq(names.getClass().getComponentType(), String.class);

// A real String[] refuses a non-String, even through an Object[] alias.
Object[] alias = names;
checkThrows(ArrayStoreException.class, () -> alias[0] = 42);

Integer[] empty = newArray(Integer.class, 0);
checkEq(empty.length, 0);
checkEq(empty.getClass().getComponentType(), Integer.class);

String[] repeated = repeat(String.class, 4, () -> "x");
checkEq(Arrays.toString(repeated), "[x, x, x, x]");

// Each element comes from its own call, so a stateful maker is not shared.
int[] counter = { 0 };
Integer[] counted = repeat(Integer.class, 3, () -> counter[0]++);
checkEq(Arrays.toString(counted), "[0, 1, 2]");
checkEq(counter[0], 3);

// A maker that builds a fresh object each time must not be called once.
StringBuilder[] builders = repeat(StringBuilder.class, 2, StringBuilder::new);
check(builders[0] != builders[1]);
builders[0].append("x");
checkEq(builders[0].toString(), "x");
checkEq(builders[1].toString(), "");

List<Object> mixed = List.of("a", 1, "b", 2.5, "c");
checkEq(instancesOf(String.class, mixed), List.of("a", "b", "c"));
checkEq(instancesOf(Integer.class, mixed), List.of(1));
checkEq(instancesOf(Double.class, mixed), List.of(2.5));
checkEq(instancesOf(Long.class, mixed), List.of());

// The result is genuinely a List<String>, so an element is one too.
String first = instancesOf(String.class, mixed).get(0);
checkEq(first, "a");

List<Object> withNull = new ArrayList<>();
Collections.addAll(withNull, "a", null, "b");
checkEq(instancesOf(String.class, withNull), List.of("a", "b"));

// A subtype counts as an instance of its supertype.
List<Object> numbers = List.of(1, 2L, 3.0);
checkEq(instancesOf(Number.class, numbers).size(), 3);
checkEq(instancesOf(Object.class, numbers).size(), 3);
```

## Hints
- `java.lang.reflect.Array.newInstance(type, length)` returns `Object`; cast it
  to `T[]`. That is an unchecked cast the compiler cannot verify and you can:
  the component type is exactly `type`.
- `Array` is not in `java.util`, so write it out in full:
  `java.lang.reflect.Array.newInstance(...)`.
- `Arrays.fill` puts the *same* reference in every slot. Some of the tests
  build a fresh object per element, so fill the array in a loop instead.
- `instancesOf` needs no cast at all: `type.isInstance(value)` is the run-time
  `instanceof`, and `type.cast(value)` returns a `T` with a checked cast.
- `isInstance(null)` is `false`, which is the behaviour the null test wants —
  the same as `null instanceof String`.

## Solution
```java
static <T> T[] newArray(Class<T> type, int length) {
    @SuppressWarnings("unchecked")
    T[] array = (T[]) java.lang.reflect.Array.newInstance(type, length);
    return array;
}

static <T> T[] repeat(Class<T> type, int count, Supplier<T> maker) {
    T[] array = newArray(type, count);
    for (int i = 0; i < count; i++) {
        array[i] = maker.get();
    }
    return array;
}

static <T> List<T> instancesOf(Class<T> type, List<?> values) {
    List<T> found = new ArrayList<>();
    for (Object value : values) {
        if (type.isInstance(value)) {
            found.add(type.cast(value));
        }
    }
    return found;
}
```

## Notes
The starter's `newArray` is the mistake this problem exists to rule out. It
compiles — with an unchecked warning, which it then suppresses — and it returns
an `Object[]`. The cast to `T[]` erases to a cast to `Object[]`, so nothing
fails inside the method. The failure lands at the *call site*, where the
compiler inserted the cast that erasure needs:

```java
String[] names = newArray(String.class, 3);
// ClassCastException: [Ljava.lang.Object; cannot be cast to [Ljava.lang.String;
```

The exception names a method that looks correct and points at a line that has
no cast in it. That is the signature of a bad unchecked suppression: the report
arrives somewhere other than the bug.

`Array.newInstance` fixes it by building an array whose component type is read
from the token at run time, so the result really is a `String[]`. The
`ArrayStoreException` test is the proof: an `Object[]` would happily accept an
`Integer`, and a `String[]` refuses one even when it is reached through an
`Object[]` variable. That check is exactly the covariance hole the chapter
described — and here it is working *for* you, confirming the array is what it
claims to be. This is how `Arrays.copyOf` and `Collection.toArray(T[])` do it;
`toArray(new String[0])` passes the token as an empty array rather than a
`Class`, but the mechanism underneath is the same call.

`instancesOf` is the more interesting half, because it needs no suppression at
all. `type.isInstance(value)` and `type.cast(value)` are the run-time forms of
`instanceof T` and `(T)`, and they are *checked*: `cast` throws
`ClassCastException` immediately if the object is the wrong type, at the point
where the mistake is. Compare that with the starter's `(T) value`, which
compiles to nothing and lets a `Double` sit inside a `List<String>` until
someone reads it. Whenever you catch yourself writing `@SuppressWarnings` on a
cast that has a `Class<T>` nearby, `cast` is almost always what you wanted.

`Arrays.fill(array, maker.get())` calls the supplier once and stores that one
reference in every slot. For `"x"` you never notice; for `StringBuilder::new`
you get an array of two references to the same builder, and appending to the
first changes the second. `Collections.nCopies` and `List.of(x, x)` share the
same trap for the same reason — the fix is always to call the factory per
element.
