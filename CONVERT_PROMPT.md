# Recursion Visualizer — Code Conversion Prompt

> **Copy everything below the line and paste it into any LLM (ChatGPT, Claude, Gemini, etc.) along with your Python code.**

---

## PROMPT TO GIVE TO LLM

```
I have a web-based Python Recursion Visualizer app. It runs Python in the browser using Pyodide and draws a tree of every recursive call.

The app has THREE input areas:

1. **Global Variables panel** — a table of variable Name → Value rows. Each row becomes a Python global. Example:
   | Name   | Value         |
   |--------|---------------|
   | arr    | [1, 2, 3]    |
   | target | 10           |

2. **Recursive Function editor** — a single Python function that MUST be named `fn`. Only calls to `fn(...)` are traced and drawn in the tree. No class, no outer wrapper, no inner helper — just one top-level `def fn(...):`

3. **Function Call box** — the exact Python expression to start execution, e.g. `fn(0, [])`.

### RULES you must follow when converting:

R1. The recursive function MUST be named exactly `fn`.
R2. Every recursive self-call inside the body must also use `fn(...)`, not the original name.
R3. All variables the function reads but does NOT receive as parameters (arrays, targets, grids, strings, config values, shared accumulators like `result = []`) must go into the Global Variables table.
R4. Remove any outer wrapper function. If the original has `def solve(...)` wrapping `def helper(...)`, discard `solve` and promote `helper` as `fn`.
R5. Remove any `self.` references. Replace `self.method()` with direct code or a global.
R6. Do NOT use decorators (@lru_cache, etc.) — the tracer replaces `fn`, so decorators break tracing.
R7. Indentation must use 4 spaces per level (no tabs).
R8. Keep total recursive calls small (≤ 80) for a readable tree. Reduce input sizes if needed.
R9. `print()` calls are fine — output appears in the app's console panel.

### OUTPUT FORMAT — respond with exactly these three sections:

**Global Variables (name = value, one per line):**
```
name1 = value1
name2 = value2
```

**Recursive Function (paste into editor):**
```python
def fn(...):
    ...
```

**Function Call (paste into call box):**
```
fn(...)
```

Also briefly explain what you changed and why.


---

## EXAMPLES

### Example 1 — Inner function pattern

**Original code given to LLM:**
```python
arr = [1,2,3]

def get_permutation(arr):
    result = []
    def permutation(asf):
        if len(asf) == len(arr):
            result.append(asf[:])
            return
        for el in arr:
            if el not in asf:
                asf.append(el)
                permutation(asf)
                asf.pop()
    permutation([])
    return result
```

**LLM should respond with:**

Global Variables:
```
arr = [1, 2, 3]
result = []
```

Recursive Function:
```python
def fn(asf):
    if len(asf) == len(arr):
        result.append(asf[:])
        print("Found:", asf[:])
        return
    for el in arr:
        if el not in asf:
            asf.append(el)
            fn(asf)
            asf.pop()
```

Function Call:
```
fn([])
```

---

### Example 2 — Class method with memoization

**Original:**
```python
class Solution:
    def longestCommonSubsequence(self, text1: str, text2: str) -> int:
        from functools import lru_cache
        @lru_cache(maxsize=None)
        def dp(i, j):
            if i == len(text1) or j == len(text2):
                return 0
            if text1[i] == text2[j]:
                return 1 + dp(i+1, j+1)
            return max(dp(i+1, j), dp(i, j+1))
        return dp(0, 0)
```

**LLM should respond with:**

Global Variables:
```
text1 = 'abcde'
text2 = 'ace'
```

Recursive Function:
```python
def fn(i, j):
    if i == len(text1) or j == len(text2):
        return 0
    if text1[i] == text2[j]:
        return 1 + fn(i+1, j+1)
    return max(fn(i+1, j), fn(i, j+1))
```

Function Call:
```
fn(0, 0)
```

---

### Example 3 — Binary tree / backtracking

**Original:**
```python
def subsets(nums):
    result = []
    def backtrack(start, current):
        result.append(current[:])
        for i in range(start, len(nums)):
            current.append(nums[i])
            backtrack(i + 1, current)
            current.pop()
    backtrack(0, [])
    return result
```

**LLM should respond with:**

Global Variables:
```
nums = [1, 2, 3]
result = []
```

Recursive Function:
```python
def fn(start, current):
    result.append(current[:])
    print("Subset:", current)
    for i in range(start, len(nums)):
        current.append(nums[i])
        fn(i + 1, current)
        current.pop()
```

Function Call:
```
fn(0, [])
```


---

### HERE IS MY CODE TO CONVERT:

<PASTE YOUR CODE HERE>
```
