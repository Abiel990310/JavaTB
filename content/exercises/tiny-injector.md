---
id: tiny-injector
title: "A dependency injector in one class"
difficulty: stretch
chapter: reflection
topics: [reflection, annotations, constructors, dependency-injection]
check: unit
standard: java21
---

Every injection framework is the same trick: look at a constructor, work out
what it needs, build those first, then call it. Write the trick.

`Injector`:

- `<T> T get(Class<T> type)` — returns an instance, constructing it and
  everything it needs
- Instances are **singletons within one injector**: asking twice gives the same
  object
- A class is constructed through the constructor annotated `@Inject`; if there
  is none, the single declared constructor is used; if there are several and
  none is annotated, throw `IllegalStateException` naming the type
- Constructor parameters are resolved recursively
- `<T> void bind(Class<T> type, T instance)` pre-registers an instance, so an
  interface can be satisfied by an implementation the injector could not have
  built
- Asking for an interface or abstract type with no binding throws
  `IllegalStateException` naming the type
- A dependency cycle throws `IllegalStateException` whose message contains
  `"cycle"` — it must not overflow the stack

## Starter
```java
import java.lang.annotation.*;
import java.lang.reflect.*;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.CONSTRUCTOR)
@interface Inject {
}

static final class Injector {
    private final Map<Class<?>, Object> instances = new HashMap<>();

    <T> void bind(Class<T> type, T instance) {
        instances.put(type, instance);
    }

    @SuppressWarnings("unchecked")
    <T> T get(Class<T> type) {
        try {
            return (T) type.getDeclaredConstructor().newInstance();
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
```

## Tests
```java
interface Clock {
    String now();
}

class FixedClock implements Clock {
    public String now() {
        return "12:00";
    }
}

class Repository {
    int loads;

    String load(String id) {
        loads++;
        return "row:" + id;
    }
}

class Service {
    final Repository repository;
    final Clock clock;

    @Inject
    Service(Repository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    Service(String unused) {
        throw new AssertionError("wrong constructor");
    }

    String describe(String id) {
        return repository.load(id) + " at " + clock.now();
    }
}

class Ambiguous {
    Ambiguous(int a) {
    }

    Ambiguous(String b) {
    }
}

class Loop {
    Loop(Loop self) {
    }
}

Injector injector = new Injector();
injector.bind(Clock.class, new FixedClock());

Service service = injector.get(Service.class);
checkEq(service.describe("7"), "row:7 at 12:00");

// Singletons within one injector.
check(injector.get(Service.class) == service);
check(injector.get(Repository.class) == service.repository);
checkEq(service.repository.loads, 1);
injector.get(Repository.class).load("8");
checkEq(service.repository.loads, 2);

// A second injector shares nothing.
Injector other = new Injector();
other.bind(Clock.class, new FixedClock());
check(other.get(Repository.class) != service.repository);

// A plain class with one constructor needs no annotation.
Repository standalone = new Injector().get(Repository.class);
checkEq(standalone.loads, 0);

// An unbound interface cannot be built.
Injector bare = new Injector();
checkThrows(IllegalStateException.class, () -> bare.get(Clock.class));

// Several constructors and no @Inject is ambiguous.
checkThrows(IllegalStateException.class, () -> new Injector().get(Ambiguous.class));

// A cycle is reported, not overflowed.
try {
    new Injector().get(Loop.class);
    check(false);
} catch (IllegalStateException expected) {
    check(expected.getMessage().contains("cycle"));
}

// A bound instance wins over construction.
Repository preBuilt = new Repository();
preBuilt.load("seed");
Injector withBinding = new Injector();
withBinding.bind(Clock.class, new FixedClock());
withBinding.bind(Repository.class, preBuilt);
checkEq(withBinding.get(Service.class).repository.loads, 1);
```

## Hints
- `get` should return an already-built instance before doing anything else, and
  store what it builds. That is the singleton requirement and half the cycle
  detection.
- Choosing the constructor: filter `getDeclaredConstructors()` for
  `isAnnotationPresent(Inject.class)`; if exactly one, use it. Otherwise, if
  there is exactly one declared constructor at all, use that. Otherwise throw.
- `type.isInterface()` and `Modifier.isAbstract(type.getModifiers())` identify
  what cannot be instantiated. Check that *after* looking for a binding.
- Recursion happens in the parameter loop: `constructor.getParameterTypes()`
  gives the classes, and each one is another `get`.
- For the cycle, keep a `Set<Class<?>>` of types currently being constructed.
  Add on the way in, remove in a `finally`, and throw if the type is already
  there.
- `newInstance` wraps whatever the constructor throws in
  `InvocationTargetException`. The tests do not exercise it, but unwrapping the
  cause makes failures readable.
- `setAccessible(true)` on the constructor, since the test classes are
  package-private.

## Solution
```java
import java.lang.annotation.*;
import java.lang.reflect.*;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.CONSTRUCTOR)
@interface Inject {
}

static final class Injector {
    private final Map<Class<?>, Object> instances = new HashMap<>();
    private final Set<Class<?>> underConstruction = new LinkedHashSet<>();

    <T> void bind(Class<T> type, T instance) {
        instances.put(type, instance);
    }

    @SuppressWarnings("unchecked")
    <T> T get(Class<T> type) {
        Object existing = instances.get(type);
        if (existing != null) {
            return (T) existing;
        }
        if (!underConstruction.add(type)) {
            throw new IllegalStateException("cycle: " + underConstruction + " then " + type.getSimpleName());
        }
        try {
            T built = construct(type);
            instances.put(type, built);
            return built;
        } finally {
            underConstruction.remove(type);
        }
    }

    @SuppressWarnings("unchecked")
    private <T> T construct(Class<T> type) {
        if (type.isInterface() || Modifier.isAbstract(type.getModifiers())) {
            throw new IllegalStateException("no binding for " + type.getSimpleName());
        }

        Constructor<?> chosen = chooseConstructor(type);
        Class<?>[] parameters = chosen.getParameterTypes();
        Object[] arguments = new Object[parameters.length];
        for (int i = 0; i < parameters.length; i++) {
            arguments[i] = get(parameters[i]);
        }

        chosen.setAccessible(true);
        try {
            return (T) chosen.newInstance(arguments);
        } catch (InvocationTargetException wrapped) {
            throw new IllegalStateException("constructing " + type.getSimpleName(), wrapped.getCause());
        } catch (ReflectiveOperationException refused) {
            throw new IllegalStateException("constructing " + type.getSimpleName(), refused);
        }
    }

    private Constructor<?> chooseConstructor(Class<?> type) {
        Constructor<?>[] declared = type.getDeclaredConstructors();

        List<Constructor<?>> annotated = new ArrayList<>();
        for (Constructor<?> candidate : declared) {
            if (candidate.isAnnotationPresent(Inject.class)) {
                annotated.add(candidate);
            }
        }
        if (annotated.size() == 1) {
            return annotated.get(0);
        }
        if (annotated.size() > 1) {
            throw new IllegalStateException("several @Inject constructors on " + type.getSimpleName());
        }
        if (declared.length == 1) {
            return declared[0];
        }
        throw new IllegalStateException("ambiguous constructors on " + type.getSimpleName());
    }
}
```

## Notes
The whole framework is four ideas, and every one of them is in the chapter.

**Pick a constructor by annotation, fall back to the only one.** This is
exactly why Spring and Guice want `@Inject` on multi-constructor classes and
tolerate its absence on single-constructor ones — there is nothing to decide.
`Service` in the tests has a second constructor that throws an `AssertionError`
precisely so a solution that grabs `getDeclaredConstructors()[0]` fails: the
order of that array is unspecified, so such a solution would work about half
the time.

**Resolve parameters recursively.** `getParameterTypes()` and a loop is the
entire dependency graph traversal. Note that it works on erased types, so a
constructor taking `List<String>` would ask for `List` and fail — real
injectors use `getGenericParameterTypes()` and a key that includes the type
argument, which is chapter 7.4's point about signatures surviving erasure.

**Cache the instance before returning it.** That gives singleton semantics, and
it means a diamond — two classes both needing a `Repository` — builds one, not
two. The test asserting `injector.get(Repository.class) == service.repository`
is checking that the object graph is a graph and not a tree.

**Track what is in flight.** Without `underConstruction`, `Loop(Loop self)`
recurses until the stack runs out, and the reader gets a `StackOverflowError`
several thousand frames deep instead of a sentence naming the cycle. The
`finally` matters as much as the `add`: an injector that fails to build
something and leaves the type marked in-flight reports a phantom cycle on the
next attempt.

What is missing, and deliberately: scopes other than singleton, field and
method injection, qualifiers for two implementations of one interface, and
thread safety. Each is another map or another annotation, and none of them
changes the shape. That is worth knowing when a framework misbehaves — the
machinery underneath is this, and it is small enough to reason about.
