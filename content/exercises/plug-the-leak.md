---
id: plug-the-leak
title: "Plug the leak"
difficulty: core
chapter: lifetime-and-gc
topics: [garbage-collection, leaks, references]
check: unit
standard: java21
---

Two classes, both correct in every functional test anyone wrote for them, and
both holding objects forever. Fix them without changing what they do.

`EventBus` delivers strings to subscribers:

- `Subscription subscribe(String topic, Consumer<String> listener)` — the
  returned `Subscription` is an `AutoCloseable` whose `close()` unsubscribes
  and is safe to call twice
- `void publish(String topic, String message)` — every current subscriber to
  that topic, in subscription order
- `int subscriberCount()` — across all topics

`Slots<T>` is a fixed-capacity stack:

- `Slots(int capacity)`, `push(T)`, `pop()`, `size()`
- `push` beyond capacity throws `IllegalStateException`, `pop` on empty throws
  `NoSuchElementException`

After a `close()` or a `pop()`, the object involved must be **unreachable** —
the tests assert that with a `WeakReference`, not by reading your code.

## Starter
```java
static final class EventBus {
    private final Map<String, List<Consumer<String>>> listeners = new HashMap<>();

    Subscription subscribe(String topic, Consumer<String> listener) {
        listeners.computeIfAbsent(topic, key -> new ArrayList<>()).add(listener);
        return new Subscription(this, topic, listener);
    }

    void publish(String topic, String message) {
        for (Consumer<String> listener : listeners.getOrDefault(topic, List.of())) {
            listener.accept(message);
        }
    }

    int subscriberCount() {
        int total = 0;
        for (List<Consumer<String>> perTopic : listeners.values()) {
            total += perTopic.size();
        }
        return total;
    }

    void unsubscribe(String topic, Consumer<String> listener) {
        // TODO
    }
}

static final class Subscription implements AutoCloseable {
    private final EventBus bus;
    private final String topic;
    private final Consumer<String> listener;

    Subscription(EventBus bus, String topic, Consumer<String> listener) {
        this.bus = bus;
        this.topic = topic;
        this.listener = listener;
    }

    @Override
    public void close() {
        bus.unsubscribe(topic, listener);
    }
}

static final class Slots<T> {
    private final Object[] items;
    private int count;

    Slots(int capacity) {
        items = new Object[capacity];
    }

    void push(T item) {
        if (count == items.length) {
            throw new IllegalStateException("full");
        }
        items[count++] = item;
    }

    @SuppressWarnings("unchecked")
    T pop() {
        if (count == 0) {
            throw new NoSuchElementException("empty");
        }
        return (T) items[--count];
    }

    int size() {
        return count;
    }
}
```

## Tests
```java
import java.lang.ref.WeakReference;

// Waits for a weak reference to clear, so "unreachable" is checked rather
// than assumed. Returns false if the object is still reachable.
Predicate<WeakReference<?>> collected = ref -> {
    for (int i = 0; i < 25 && ref.get() != null; i++) {
        System.gc();
        try {
            Thread.sleep(20);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
    return ref.get() == null;
};

EventBus bus = new EventBus();
List<String> heard = new ArrayList<>();

Subscription first = bus.subscribe("news", heard::add);
Subscription second = bus.subscribe("news", message -> heard.add("2:" + message));
Subscription other = bus.subscribe("sport", message -> heard.add("s:" + message));

checkEq(bus.subscriberCount(), 3);
bus.publish("news", "a");
checkEq(heard, List.of("a", "2:a"));

bus.publish("sport", "b");
checkEq(heard, List.of("a", "2:a", "s:b"));
bus.publish("weather", "c");
checkEq(heard.size(), 3);

second.close();
checkEq(bus.subscriberCount(), 2);
heard.clear();
bus.publish("news", "d");
checkEq(heard, List.of("d"));

second.close();                       // closing twice changes nothing
checkEq(bus.subscriberCount(), 2);

first.close();
other.close();
checkEq(bus.subscriberCount(), 0);
heard.clear();
bus.publish("news", "e");
checkEq(heard, List.of());

// A closed subscription must not keep its listener alive.
int[] payload = new int[10_000];
Consumer<String> heavy = message -> payload[0]++;
WeakReference<Object> watcher = new WeakReference<>(heavy);
Subscription temporary = bus.subscribe("news", heavy);
bus.publish("news", "f");
checkEq(payload[0], 1);
temporary.close();
heavy = null;
check(collected.test(watcher));

Slots<Object> slots = new Slots<>(2);
Object held = new Object();
slots.push(held);
slots.push(new Object());
checkEq(slots.size(), 2);
checkThrows(IllegalStateException.class, () -> slots.push(new Object()));

Object top = slots.pop();
check(top != held);
checkEq(slots.size(), 1);
checkEq(slots.pop(), held);
checkEq(slots.size(), 0);
checkThrows(NoSuchElementException.class, slots::pop);

// A popped object must not be held by the vacated slot.
Slots<Object> one = new Slots<>(1);
Object temporaryValue = new Object();
one.push(temporaryValue);
WeakReference<Object> popped = new WeakReference<>(one.pop());
temporaryValue = null;
check(collected.test(popped));
```

## Hints
- `unsubscribe` is empty, so `close()` does nothing at all — the count never
  drops and the listener is held by the bus forever.
- Removing from a `List<Consumer<String>>` uses `equals`, and two distinct
  lambdas are never equal. `remove(Object)` works here because you are removing
  the *same* listener instance, which is equal to itself by identity.
- When a topic's list becomes empty, remove the topic too — otherwise the map
  grows one dead entry per topic ever used.
- `pop` reads the slot and decrements, and leaves the reference in the array.
  Chapter 5.2's `safe-generic-container` solved this exact problem; the
  one-line fix is the same one `ArrayList.remove` makes.
- `WeakReference<Object> popped = new WeakReference<>(one.pop())` deliberately
  keeps no strong reference to the popped object, so the only thing that could
  still hold it is your array.

## Solution
```java
static final class EventBus {
    private final Map<String, List<Consumer<String>>> listeners = new HashMap<>();

    Subscription subscribe(String topic, Consumer<String> listener) {
        listeners.computeIfAbsent(topic, key -> new ArrayList<>()).add(listener);
        return new Subscription(this, topic, listener);
    }

    void publish(String topic, String message) {
        for (Consumer<String> listener : List.copyOf(listeners.getOrDefault(topic, List.of()))) {
            listener.accept(message);
        }
    }

    int subscriberCount() {
        int total = 0;
        for (List<Consumer<String>> perTopic : listeners.values()) {
            total += perTopic.size();
        }
        return total;
    }

    void unsubscribe(String topic, Consumer<String> listener) {
        List<Consumer<String>> perTopic = listeners.get(topic);
        if (perTopic == null) {
            return;
        }
        perTopic.remove(listener);
        if (perTopic.isEmpty()) {
            listeners.remove(topic);
        }
    }
}

static final class Subscription implements AutoCloseable {
    private final EventBus bus;
    private final String topic;
    private Consumer<String> listener;

    Subscription(EventBus bus, String topic, Consumer<String> listener) {
        this.bus = bus;
        this.topic = topic;
        this.listener = listener;
    }

    @Override
    public void close() {
        if (listener != null) {
            bus.unsubscribe(topic, listener);
            listener = null;
        }
    }
}

static final class Slots<T> {
    private final Object[] items;
    private int count;

    Slots(int capacity) {
        items = new Object[capacity];
    }

    void push(T item) {
        if (count == items.length) {
            throw new IllegalStateException("full");
        }
        items[count++] = item;
    }

    @SuppressWarnings("unchecked")
    T pop() {
        if (count == 0) {
            throw new NoSuchElementException("empty");
        }
        T item = (T) items[--count];
        items[count] = null;              // the slot must let go
        return item;
    }

    int size() {
        return count;
    }
}
```

## Notes
Neither class is broken in the way a functional test would catch. The bus
delivers correctly; the stack pops in the right order. What they get wrong is
what they keep, and the `WeakReference` checks are the only kind of test that
sees it.

The `Subscription` case has a second half worth noticing. Removing the listener
from the bus is necessary but not sufficient: `Subscription` itself holds a
field pointing at the listener, so as long as the caller keeps the
subscription, the listener is still reachable. Nulling `listener` in `close()`
fixes that and makes the double-`close()` requirement fall out for free —
`close()` on an already-closed subscription has nothing to do. A subscription
object that outlives its subscription is small; a listener that captures a
window, a session, or a ten-thousand-element array is not.

Removing the topic when its list empties is the third piece. Without it a bus
that sees a million distinct topics keeps a million empty `ArrayList`s, which
is a leak that grows slowly enough to reach production.

`Slots.pop` is the same one-line fix as chapter 5.2, and it is here again
because it is the single most common version of this bug: an array-backed
container that decrements a counter and considers the element gone. It is not
gone. The array is a strong reference, the array is reachable from the
container, and the container is reachable from the caller. Everything ever
pushed stays alive until the slot is overwritten by a later push — which, for a
stack that is used and then left alone, may be never.

One more change in the solution has nothing to do with leaks: `publish`
iterates a copy. Without it, a listener that unsubscribes itself while being
notified would mutate the list being iterated and throw
`ConcurrentModificationException` — chapter 4.4's failure, reached by a path
that looks nothing like a loop over a collection. The tests here do not cover
it, which is exactly why it is worth writing down.
