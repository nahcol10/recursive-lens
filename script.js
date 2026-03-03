// ============================================================
// Global State
// ============================================================
let pyodide = null;
let executionSteps = [];
let currentStep = -1;
let isPlaying = false;
let playInterval = null;
let animationSpeed = 800;
let treeRoot = null;
let treeNodeMap = {};
let executionStartTime = 0;

// ============================================================
// Templates
// ============================================================
const templates = {
    subset: {
        variables: [{ name: 'arr', value: '[1, 2, 3]' }],
        code: 'def fn(index, curr):\n    # Generate all subsets\n    if index == len(arr):\n        print(f"Subset found: {curr}")\n        return curr[:]\n\n    # Include current element\n    curr.append(arr[index])\n    include = fn(index + 1, curr)\n\n    # Exclude (backtrack)\n    curr.pop()\n    exclude = fn(index + 1, curr)\n\n    return [include, exclude]',
        call: 'fn(0, [])'
    },
    permutation: {
        variables: [{ name: 'arr', value: '[1, 2, 3]' }],
        code: 'def fn(asf):\n    # Generate all permutations\n    if len(asf) == len(arr):\n        print(f"Permutation: {asf}")\n        return asf[:]\n\n    results = []\n    for el in arr:\n        if el not in asf:\n            asf.append(el)\n            results.append(fn(asf))\n            asf.pop()\n\n    return results',
        call: 'fn([])'
    },
    fibonacci: {
        variables: [{ name: 'n', value: '5' }],
        code: 'def fn(i):\n    # Fibonacci without memoization\n    if i <= 1:\n        return i\n\n    return fn(i-1) + fn(i-2)',
        call: 'fn(5)'
    },
    nqueens: {
        variables: [{ name: 'n', value: '4' }],
        code: 'def fn(row, cols, diag1, diag2):\n    # N-Queens counter\n    if row == n:\n        return 1\n\n    count = 0\n    for col in range(n):\n        if col not in cols and (row-col) not in diag1 and (row+col) not in diag2:\n            cols.add(col)\n            diag1.add(row-col)\n            diag2.add(row+col)\n\n            count += fn(row+1, cols, diag1, diag2)\n\n            cols.remove(col)\n            diag1.remove(row-col)\n            diag2.remove(row+col)\n\n    return count',
        call: 'fn(0, set(), set(), set())'
    },
    knapsack: {
        variables: [
            { name: 'weights', value: '[2, 3, 4, 5]' },
            { name: 'values', value: '[3, 4, 5, 6]' },
            { name: 'capacity', value: '5' }
        ],
        code: 'def fn(i, remaining):\n    # 0/1 Knapsack problem\n    if i == len(weights) or remaining == 0:\n        return 0\n\n    # Skip item\n    skip = fn(i + 1, remaining)\n\n    # Take item if possible\n    take = 0\n    if weights[i] <= remaining:\n        take = values[i] + fn(i + 1, remaining - weights[i])\n\n    return max(skip, take)',
        call: 'fn(0, 5)'
    },
    lcs: {
        variables: [
            { name: 'a', value: "'AGTB'" },
            { name: 'b', value: "'GTXAB'" }
        ],
        code: 'def fn(i, j):\n    # Longest Common Subsequence\n    if i == len(a) or j == len(b):\n        return 0\n\n    if a[i] == b[j]:\n        return 1 + fn(i+1, j+1)\n\n    return max(fn(i+1, j), fn(i, j+1))',
        call: 'fn(0, 0)'
    },
    coin_change: {
        variables: [
            { name: 'coins', value: '[1, 2, 5]' },
            { name: 'amount', value: '4' }
        ],
        code: 'def fn(remaining):\n    # Minimum coins for change (no memo)\n    if remaining < 0:\n        return float("inf")\n    if remaining == 0:\n        return 0\n\n    min_coins = float("inf")\n    for coin in coins:\n        result = fn(remaining - coin)\n        min_coins = min(min_coins, result + 1)\n\n    return min_coins',
        call: 'fn(4)'
    },
    custom: {
        variables: [{ name: 'n', value: '5' }],
        code: '# Write your own recursive function here.\n# It MUST be named "fn".\ndef fn(n):\n    if n <= 0:\n        return 0\n    print(f"Processing: {n}")\n    return n + fn(n - 1)',
        call: 'fn(5)'
    }
};

// ============================================================
// Pyodide initialisation
// ============================================================
async function initPyodide() {
    try {
        pyodide = await loadPyodide();
        setTimeout(function () {
            document.getElementById('loadingOverlay').classList.add('hidden');
            document.getElementById('runBtn').disabled = false;
        }, 500);
        addLog('Python runtime loaded successfully!', 'success');
    } catch (error) {
        console.error('Failed to load Pyodide:', error);
        document.querySelector('.loading-text').textContent =
            'Failed to load Python runtime. Please refresh the page.';
        showError('Failed to load Pyodide: ' + error.message);
    }
}

// ============================================================
// Variable helpers
// ============================================================
function addVariable() {
    var container = document.getElementById('variablesContainer');
    var row = document.createElement('div');
    row.className = 'variable-row';
    var num = container.children.length + 1;
    row.innerHTML =
        '<input type="text" class="variable-name" value="var' + num + '">' +
        '<span class="variable-equals">=</span>' +
        '<input type="text" class="variable-value" value="0">' +
        '<button class="remove-var-btn" onclick="this.parentElement.remove()">&#215;</button>';
    container.appendChild(row);
}

function toggleBulkPaste() {
    var area = document.getElementById('bulkPasteArea');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
    if (area.style.display === 'block') {
        document.getElementById('bulkPasteInput').focus();
    }
}

function applyBulkPaste() {
    var raw = document.getElementById('bulkPasteInput').value.trim();
    if (!raw) return;
    var lines = raw.split('\n');
    var parsed = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        var eqIndex = line.indexOf('=');
        if (eqIndex < 1) continue;
        var name = line.substring(0, eqIndex).trim();
        var value = line.substring(eqIndex + 1).trim();
        if (name && value) {
            parsed.push({ name: name, value: value });
        }
    }
    if (parsed.length === 0) {
        addLog('No valid "name = value" lines found.', 'error');
        return;
    }
    loadVariables(parsed);
    document.getElementById('bulkPasteInput').value = '';
    document.getElementById('bulkPasteArea').style.display = 'none';
    addLog('Loaded ' + parsed.length + ' variable(s) from paste.', 'success');
}

function createVariableRow(name, value, removable) {
    var row = document.createElement('div');
    row.className = 'variable-row';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'variable-name';
    nameInput.value = name;
    var eq = document.createElement('span');
    eq.className = 'variable-equals';
    eq.textContent = '=';
    var valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'variable-value';
    valInput.value = value;
    row.appendChild(nameInput);
    row.appendChild(eq);
    row.appendChild(valInput);
    if (removable) {
        var btn = document.createElement('button');
        btn.className = 'remove-var-btn';
        btn.innerHTML = '&#215;';
        btn.onclick = function () { row.remove(); };
        row.appendChild(btn);
    }
    return row;
}

// ============================================================
// Code editor helpers
// ============================================================
function formatCode() {
    var editor = document.getElementById('codeEditor');
    var lines = editor.value.split('\n');
    var formatted = [];
    for (var i = 0; i < lines.length; i++) {
        // Replace tabs with 4 spaces
        var line = lines[i].replace(/\t/g, '    ');
        // Count leading spaces, snap to multiple of 4
        var leading = line.match(/^( *)/)[1].length;
        var snapped = Math.round(leading / 4) * 4;
        line = ' '.repeat(snapped) + line.trimStart();
        formatted.push(line);
    }
    editor.value = formatted.join('\n');
    addLog('Code formatted (tabs -> 4 spaces, indentation normalised)', 'success');
}

function copyCode() {
    var code = document.getElementById('codeEditor').value;
    navigator.clipboard.writeText(code).then(function () {
        addLog('Code copied to clipboard', 'success');
    }).catch(function () {
        addLog('Failed to copy code', 'error');
    });
}

function clearCode() {
    document.getElementById('codeEditor').value = '';
    document.getElementById('functionCall').value = '';
    addLog('Code cleared', 'success');
}

// ============================================================
// Modals
// ============================================================
function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorModal').classList.add('visible');
}

function closeErrorModal() {
    document.getElementById('errorModal').classList.remove('visible');
}

function showHelp() {
    document.getElementById('helpModal').classList.add('visible');
}

function closeHelp() {
    document.getElementById('helpModal').classList.remove('visible');
}

// ============================================================
// Console
// ============================================================
function toggleConsole() {
    document.getElementById('outputConsole').classList.toggle('visible');
}

function addLog(message, type) {
    var consoleEl = document.getElementById('consoleContent');
    var line = document.createElement('div');
    line.className = 'console-line' + (type ? ' ' + type : '');
    line.textContent = message;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    if (document.getElementById('consoleToggle').classList.contains('active')) {
        document.getElementById('outputConsole').classList.add('visible');
    }
}

function clearConsole() {
    document.getElementById('consoleContent').innerHTML = '';
}

// ============================================================
// Python instrumentation
// Uses pyodide.globals.set() to pass user code safely,
// avoiding all string-escaping issues.
// ============================================================
function buildPythonRunner(variables, functionCall) {
    var varDefs = variables.map(function (v) {
        return v.name + ' = ' + v.value;
    }).join('\n');

    // NOTE: __user_code__ is set on pyodide.globals BEFORE this runs
    var py = [
        'import json, sys, time',
        'from io import StringIO',
        '',
        '_old_stdout = sys.stdout',
        'sys.stdout = StringIO()',
        '',
        '_execution_log = []',
        '_call_stack = []',
        '_call_counter = [0]',
        '_start = [time.time()]',
        '',
        varDefs,
        '',
        '# Execute user code (passed via __user_code__ global)',
        'exec(__user_code__, globals())',
        '',
        'if "fn" not in dir():',
        '    raise Exception("Function \'fn\' not found. Name your recursive function \'fn\'.")',
        '',
        '_user_fn = fn',
        '',
        'def _trace_call(name, args, kwargs):',
        '    cid = _call_counter[0]',
        '    _call_counter[0] += 1',
        '    pid = _call_stack[-1] if _call_stack else None',
        '    depth = len(_call_stack)',
        '    _execution_log.append({"type":"call","id":cid,"parent_id":pid,"func":name,"args":str(args),"kwargs":str(kwargs),"depth":depth,"timestamp":len(_execution_log)})',
        '    _call_stack.append(cid)',
        '    return cid',
        '',
        'def _trace_return(cid, value):',
        '    if _call_stack and _call_stack[-1] == cid:',
        '        _call_stack.pop()',
        '    _execution_log.append({"type":"return","id":cid,"value":str(value) if value is not None else "None","depth":len(_call_stack),"timestamp":len(_execution_log)})',
        '    return value',
        '',
        'def _traced_fn(*args, **kwargs):',
        '    cid = _trace_call("fn", args, kwargs)',
        '    try:',
        '        result = _user_fn(*args, **kwargs)',
        '        return _trace_return(cid, result)',
        '    except Exception as _e:',
        '        if _call_stack and _call_stack[-1] == cid:',
        '            _call_stack.pop()',
        '        raise _e',
        '',
        'fn = _traced_fn   # replace global fn with traced wrapper',
        '',
        '_final = None',
        'try:',
        '    _final = ' + functionCall,
        '    print(f"\\nFinal result: {_final}")',
        'except Exception as _e:',
        '    print(f"\\nError: {_e}")',
        '    raise _e',
        '',
        '_elapsed = (time.time() - _start[0]) * 1000',
        '_output = sys.stdout.getvalue()',
        'sys.stdout = _old_stdout',
        '',
        'json.dumps({"log":_execution_log,"output":_output,"final_result":str(_final) if _final is not None else "None","execution_time":_elapsed})'
    ];
    return py.join('\n');
}

// ============================================================
// Tree building
// ============================================================
function buildTree(log) {
    var nodes = new Map();
    var i, entry, rootNode = null;

    for (i = 0; i < log.length; i++) {
        entry = log[i];
        if (entry.type === 'call') {
            nodes.set(entry.id, {
                id: entry.id,
                func: entry.func,
                args: entry.args,
                depth: entry.depth,
                children: [],
                parent: entry.parent_id,
                returnValue: null,
                x: 0,
                y: 0  // will be set by layout
            });
        }
    }

    nodes.forEach(function (node) {
        if (node.parent !== null && nodes.has(node.parent)) {
            nodes.get(node.parent).children.push(node);
        } else if (node.parent === null) {
            rootNode = node;
        }
    });

    for (i = 0; i < log.length; i++) {
        entry = log[i];
        if (entry.type === 'return' && nodes.has(entry.id)) {
            nodes.get(entry.id).returnValue = entry.value;
        }
    }

    if (rootNode) {
        // Use Reingold-Tilford-style bottom-up layout for no-overlap
        computeSubtreeWidth(rootNode);
        assignPositionsBottomUp(rootNode, 0);
    }
    return rootNode;
}

// Minimum horizontal gap between sibling subtrees (center-to-center)
var NODE_MIN_GAP = 200;
var LEVEL_HEIGHT = 130;

// Compute the width each subtree needs so nothing overlaps
function computeSubtreeWidth(node) {
    if (node.children.length === 0) {
        node._subtreeWidth = NODE_MIN_GAP;
        return node._subtreeWidth;
    }
    var total = 0;
    node.children.forEach(function (child) {
        total += computeSubtreeWidth(child);
    });
    node._subtreeWidth = Math.max(NODE_MIN_GAP, total);
    return node._subtreeWidth;
}

// Assign x positions bottom-up so every subtree has enough room
function assignPositionsBottomUp(node, leftEdge) {
    node.y = node.depth * LEVEL_HEIGHT;
    if (node.children.length === 0) {
        node.x = leftEdge + node._subtreeWidth / 2;
        return;
    }
    var cursor = leftEdge;
    node.children.forEach(function (child) {
        assignPositionsBottomUp(child, cursor);
        cursor += child._subtreeWidth;
    });
    // Center parent over its children
    var firstChild = node.children[0];
    var lastChild = node.children[node.children.length - 1];
    node.x = (firstChild.x + lastChild.x) / 2;
}

// ============================================================
// Rendering
// ============================================================
// Build a flat id→node map so updateVisualization can read positions
function buildNodeMap(node) {
    treeNodeMap[node.id] = node;
    node.children.forEach(function (child) { buildNodeMap(child); });
}

function renderTree(root) {
    var container = document.getElementById('treeContainer');
    container.innerHTML = '';
    resetZoomPan();
    if (!root) {
        var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', '600');
        t.setAttribute('y', '200');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', 'var(--text-secondary)');
        t.textContent = 'No execution data. Click Run to visualize.';
        container.appendChild(t);
        return;
    }
    // Render nodes first so _halfW/_halfH are computed
    renderNodes(container, root);
    // Build flat lookup map for dynamic label injection during animation
    treeNodeMap = {};
    buildNodeMap(root);
    // Then render edges using computed node sizes (inserted before nodes so nodes draw on top)
    var firstChild = container.firstChild;
    var edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgeGroup.setAttribute('class', 'edge-group');
    renderEdges(edgeGroup, root);
    container.insertBefore(edgeGroup, firstChild);

    var bounds = calculateBounds(root);
    var w = bounds.maxX - bounds.minX + 300;
    var h = bounds.maxY + 200;
    var svg = document.getElementById('treeSvg');
    svg.setAttribute('viewBox', (bounds.minX - 150) + ' -40 ' + w + ' ' + h);
}

function calculateBounds(node) {
    var minX = node.x, maxX = node.x, maxY = node.y;
    node.children.forEach(function (child) {
        var b = calculateBounds(child);
        if (b.minX < minX) minX = b.minX;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
    });
    return { minX: minX, maxX: maxX, maxY: maxY };
}

function renderEdges(container, node) {
    node.children.forEach(function (child) {
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        var sy = node.y + (node._halfH || 22);
        var ey = child.y - (child._halfH || 22);
        var sx = node.x, ex = child.x;
        var my = (sy + ey) / 2;
        path.setAttribute('d', 'M ' + sx + ' ' + sy + ' C ' + sx + ' ' + my + ', ' + ex + ' ' + my + ', ' + ex + ' ' + ey);
        path.setAttribute('class', 'edge');
        path.setAttribute('data-from', node.id);
        path.setAttribute('data-to', child.id);
        path.setAttribute('id', 'edge-' + node.id + '-' + child.id);
        container.appendChild(path);

        renderEdges(container, child);
    });
}

// Clean Python tuple string for display — removes wrapping parens,
// trailing commas, and extra whitespace so "(3,)" becomes "3"
function cleanArgs(raw) {
    var s = raw.replace(/^\(/, '').replace(/\)$/, '');  // strip outer parens
    s = s.replace(/,\s*$/, '');                          // strip trailing comma
    s = s.replace(/'/g, '');                              // strip single quotes
    s = s.replace(/\s{2,}/g, ' ');                        // collapse whitespace
    s = s.trim();
    return s || 'fn()';
}

function renderNodes(container, node) {
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(' + node.x + ', ' + node.y + ')');
    g.setAttribute('class', 'node-group');
    g.setAttribute('data-id', node.id);

    // Build clean display text
    var disp = cleanArgs(node.args);

    // Dynamic pill width based on text length (monospace ~9.6px per char at 16px)
    var charWidth = 10.8;
    var textWidth = disp.length * charWidth;
    var padX = 22;
    var halfW = Math.max(34, (textWidth / 2) + padX);
    var halfH = 24;
    node._halfW = halfW;
    node._halfH = halfH;

    // Pill-shaped rect
    var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', -halfW);
    rect.setAttribute('y', -halfH);
    rect.setAttribute('width', halfW * 2);
    rect.setAttribute('height', halfH * 2);
    rect.setAttribute('rx', halfH);  // fully rounded ends
    rect.setAttribute('ry', halfH);
    rect.setAttribute('class', 'tree-node');
    rect.setAttribute('id', 'node-' + node.id);
    g.appendChild(rect);

    // Text label
    var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'node-text');
    text.textContent = disp;
    g.appendChild(text);

    // Tooltip on hover: full fn(args) -> return
    var fullLabel = 'fn(' + disp + ')';
    if (node.returnValue !== null) fullLabel += '  \u2192  ' + node.returnValue;
    var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = fullLabel;
    g.appendChild(title);

    container.appendChild(g);
    node.children.forEach(function (child) { renderNodes(container, child); });
}

// ============================================================
// Step-by-step visualisation
// ============================================================
function updateVisualization() {
    if (currentStep < 0 || currentStep >= executionSteps.length) return;

    var step = executionSteps[currentStep];
    var progress = ((currentStep + 1) / executionSteps.length) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('statStep').textContent = (currentStep + 1) + '/' + executionSteps.length;

    var statusText = document.getElementById('statusText');
    if (step.type === 'call') {
        statusText.textContent = 'Calling fn' + step.args + ' (depth ' + step.depth + ')';
        statusText.classList.add('visible');
    } else if (step.type === 'return') {
        var parent = executionSteps.find(function (s) { return s.id === step.id && s.type === 'call'; });
        if (parent) {
            statusText.textContent = 'fn' + parent.args + ' returns ' + step.value;
            statusText.classList.add('visible');
        }
    }

    document.querySelectorAll('.tree-node').forEach(function (n) {
        n.classList.remove('active', 'returning', 'completed');
    });
    document.querySelectorAll('.edge').forEach(function (e) {
        e.classList.remove('active', 'return');
    });
    var activeCalls = new Set();
    var completedCalls = new Set();
    for (var i = 0; i <= currentStep; i++) {
        var s = executionSteps[i];
        if (s.type === 'call') activeCalls.add(s.id);
        else if (s.type === 'return') { activeCalls.delete(s.id); completedCalls.add(s.id); }
    }

    activeCalls.forEach(function (id) {
        var nd = document.getElementById('node-' + id);
        if (nd) nd.classList.add('active');
    });
    completedCalls.forEach(function (id) {
        var nd = document.getElementById('node-' + id);
        if (nd) nd.classList.add('completed');
    });

    // Dynamically manage return value labels:
    // - strip .active from all existing labels
    // - remove labels whose node is no longer in completedCalls (step backward)
    // - create labels for newly completed nodes (not yet in the DOM)
    var edgeGroup = document.querySelector('.edge-group');
    var showReturnValues = document.getElementById('returnValueToggle').classList.contains('active');
    document.querySelectorAll('.edge-label').forEach(function (lbl) {
        lbl.classList.remove('active');
        var parts = lbl.id.split('-');
        var childId = parseInt(parts[parts.length - 1]);
        if (!completedCalls.has(childId)) lbl.remove();
    });
    if (showReturnValues && edgeGroup) {
        completedCalls.forEach(function (id) {
            var childNode = treeNodeMap[id];
            if (!childNode || childNode.parent === null || !treeNodeMap[childNode.parent]) return;
            if (document.getElementById('label-' + childNode.parent + '-' + id)) return; // already in DOM
            var parentNode = treeNodeMap[childNode.parent];
            var sy = parentNode.y + (parentNode._halfH || 22);
            var ey = childNode.y - (childNode._halfH || 22);
            var sx = parentNode.x, ex = childNode.x;
            var my = (sy + ey) / 2;
            var labelX = (sx + ex) / 2 + (ex > sx ? 12 : -12);
            var labelY = my - 8;
            var lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            lbl.setAttribute('x', labelX);
            lbl.setAttribute('y', labelY);
            lbl.setAttribute('class', 'edge-label');
            lbl.setAttribute('id', 'label-' + childNode.parent + '-' + id);
            var retVal = String(childNode.returnValue).replace(/^\(/, '').replace(/\)$/, '').replace(/,\s*$/, '');
            lbl.textContent = retVal;
            var retTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            retTitle.textContent = 'Return: ' + childNode.returnValue;
            lbl.appendChild(retTitle);
            edgeGroup.appendChild(lbl);
        });
    }

    if (step.type === 'call') {
        var n1 = document.getElementById('node-' + step.id);
        if (n1) n1.classList.add('active');
    } else if (step.type === 'return') {
        var n2 = document.getElementById('node-' + step.id);
        if (n2) n2.classList.add('returning');
        var parentCall = executionSteps.find(function (ss) { return ss.id === step.id && ss.type === 'call'; });
        if (parentCall && parentCall.parent_id !== null) {
            var edge = document.getElementById('edge-' + parentCall.parent_id + '-' + step.id);
            if (edge) edge.classList.add('active', 'return');
            var label = document.getElementById('label-' + parentCall.parent_id + '-' + step.id);
            if (label) label.classList.add('active');
        }
    }

    document.getElementById('prevBtn').disabled = currentStep <= 0;
    document.getElementById('nextBtn').disabled = currentStep >= executionSteps.length - 1;
    document.getElementById('stepBackBtn').disabled = currentStep <= 0;
    document.getElementById('stepForwardBtn').disabled = currentStep >= executionSteps.length - 1;
    document.getElementById('resetBtn').disabled = currentStep < 0;
}

// ============================================================
// Run
// ============================================================
async function runVisualization() {
    var runBtn = document.getElementById('runBtn');
    runBtn.disabled = true;
    runBtn.classList.add('loading');
    runBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin:0;"></span> Running...';

    clearConsole();
    executionStartTime = performance.now();

    try {
        // Collect variables
        var variables = [];
        document.querySelectorAll('.variable-row').forEach(function (row) {
            var name = row.querySelector('.variable-name').value.trim();
            var value = row.querySelector('.variable-value').value.trim();
            if (name && value) variables.push({ name: name, value: value });
        });

        var code = document.getElementById('codeEditor').value;
        var functionCall = document.getElementById('functionCall').value.trim() || 'fn()';

        if (!code.trim()) throw new Error('Please enter some Python code.');
        if (!/def\s+fn\s*\(/.test(code)) throw new Error("Your function must be named 'fn'.  e.g.  def fn(n):");

        // Normalise indentation: tabs -> 4 spaces
        code = code.replace(/\t/g, '    ');

        // Pass user code safely via Pyodide globals (no string escaping needed)
        pyodide.globals.set('__user_code__', code);

        var pyCode = buildPythonRunner(variables, functionCall);
        var result = await pyodide.runPythonAsync(pyCode);
        var data = JSON.parse(result);

        executionSteps = data.log;
        treeRoot = buildTree(executionSteps);
        renderTree(treeRoot);
        currentStep = -1;

        var callSteps = executionSteps.filter(function (s) { return s.type === 'call'; });
        var maxDepth = 0;
        callSteps.forEach(function (s) { if (s.depth > maxDepth) maxDepth = s.depth; });
        document.getElementById('statCalls').textContent = callSteps.length;
        document.getElementById('statDepth').textContent = maxDepth;

        if (data.output) {
            data.output.split('\n').filter(function (l) { return l.trim(); }).forEach(function (line) {
                addLog(line, (line.indexOf('Error') !== -1) ? 'error' : 'success');
            });
        }

        var elapsed = Math.round(performance.now() - executionStartTime);
        document.getElementById('statTime').textContent = elapsed + 'ms';

        document.getElementById('playPauseBtn').disabled = false;
        document.getElementById('stepForwardBtn').disabled = false;

        if (document.getElementById('animationToggle').classList.contains('active')) {
            startPlayback();
        } else {
            currentStep = executionSteps.length - 1;
            updateVisualization();
        }
        addLog('Execution completed in ' + elapsed + 'ms', 'success');

    } catch (error) {
        console.error('Execution error:', error);
        var msg = String(error.message || error);
        // Try to extract the useful Python error from Pyodide's verbose output
        var pyErrMatch = msg.match(/(?:Exception|Error|TypeError|ValueError|NameError|IndentationError|SyntaxError):\s*.+/);
        showError(pyErrMatch ? pyErrMatch[0] : msg);
        addLog('Error: ' + (pyErrMatch ? pyErrMatch[0] : msg), 'error');
    } finally {
        runBtn.disabled = false;
        runBtn.classList.remove('loading');
        runBtn.innerHTML = '<span>&#9654;</span> Run';
    }
}

// ============================================================
// Playback
// ============================================================
function startPlayback() {
    isPlaying = true;
    document.getElementById('playPauseBtn').innerHTML = '&#9208;';
    if (currentStep >= executionSteps.length - 1) currentStep = -1;
    playInterval = setInterval(function () {
        if (currentStep < executionSteps.length - 1) {
            currentStep++;
            updateVisualization();
        } else {
            stopPlayback();
        }
    }, animationSpeed);
}

function stopPlayback() {
    isPlaying = false;
    document.getElementById('playPauseBtn').innerHTML = '&#9654;';
    if (playInterval) { clearInterval(playInterval); playInterval = null; }
}

function stepForward() {
    stopPlayback();
    if (currentStep < executionSteps.length - 1) { currentStep++; updateVisualization(); }
}

function stepBack() {
    stopPlayback();
    if (currentStep > 0) { currentStep--; updateVisualization(); }
}

function resetVisualization() {
    stopPlayback();
    currentStep = -1;
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('statusText').classList.remove('visible');
    document.getElementById('statStep').textContent = '0/' + executionSteps.length;
    document.querySelectorAll('.tree-node').forEach(function (n) { n.classList.remove('active', 'returning', 'completed'); });
    document.querySelectorAll('.edge').forEach(function (e) { e.classList.remove('active', 'return'); });
    document.getElementById('prevBtn').disabled = true;
    document.getElementById('nextBtn').disabled = executionSteps.length > 0 ? false : true;
    document.getElementById('stepBackBtn').disabled = true;
    document.getElementById('stepForwardBtn').disabled = executionSteps.length > 0 ? false : true;
}

// ============================================================
// Export / Import
// ============================================================
function exportCode() {
    var variables = [];
    document.querySelectorAll('.variable-row').forEach(function (row) {
        variables.push({
            name: row.querySelector('.variable-name').value,
            value: row.querySelector('.variable-value').value
        });
    });
    var data = {
        code: document.getElementById('codeEditor').value,
        variables: variables,
        functionCall: document.getElementById('functionCall').value
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'recursion-visualizer-code.json';
    a.click();
    URL.revokeObjectURL(url);
    addLog('Code exported', 'success');
}

function importCode() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var data = JSON.parse(ev.target.result);
                document.getElementById('codeEditor').value = data.code || '';
                document.getElementById('functionCall').value = data.functionCall || '';
                loadVariables(data.variables || []);
                addLog('Code imported', 'success');
            } catch (err) {
                showError('Invalid file: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ============================================================
// HTML-safe escaping
// ============================================================
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// Load variables into the UI
// ============================================================
function loadVariables(vars) {
    var container = document.getElementById('variablesContainer');
    container.innerHTML = '';
    vars.forEach(function (v) {
        container.appendChild(createVariableRow(v.name, v.value, true));
    });
}

// ============================================================
// Expand / Collapse left panel
// ============================================================
var isExpanded = false;

// ============================================================
// Zoom and Pan for SVG — smooth, zoom-to-cursor, touch support
// ============================================================
var zoomLevel = 1;
var panX = 0, panY = 0;
var isPanning = false;
var panStartX = 0, panStartY = 0;
var panAnimId = null;
var targetPanX = 0, targetPanY = 0;
var targetZoom = 1;
var zoomAnimId = null;

function resetZoomPan() {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    targetPanX = 0;
    targetPanY = 0;
    targetZoom = 1;
    applyZoomPan();
}

function applyZoomPan() {
    var container = document.getElementById('treeContainer');
    container.setAttribute('transform',
        'translate(' + panX + ', ' + panY + ') scale(' + zoomLevel + ')');
}

// Smooth interpolation towards target zoom (called via rAF)
function animateZoom() {
    var dz = targetZoom - zoomLevel;
    var dx = targetPanX - panX;
    var dy = targetPanY - panY;
    // Lerp factor — higher = snappier
    var t = 0.25;
    zoomLevel += dz * t;
    panX += dx * t;
    panY += dy * t;
    applyZoomPan();
    if (Math.abs(dz) > 0.001 || Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        zoomAnimId = requestAnimationFrame(animateZoom);
    } else {
        zoomLevel = targetZoom;
        panX = targetPanX;
        panY = targetPanY;
        applyZoomPan();
        zoomAnimId = null;
    }
}

function initZoomPan() {
    var canvas = document.getElementById('vizCanvas');
    var svg = document.getElementById('treeSvg');

    // ---- Mouse wheel zoom (zoom toward cursor) ----
    canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        // Multiplicative zoom for consistent feel at all scales
        var factor = e.deltaY > 0 ? 0.92 : 1.08;
        // Finer zoom with Ctrl held
        if (e.ctrlKey) factor = e.deltaY > 0 ? 0.97 : 1.03;
        var newZoom = Math.min(5, Math.max(0.05, targetZoom * factor));

        // Get cursor position in SVG viewport coordinates
        var rect = svg.getBoundingClientRect();
        var cursorX = e.clientX - rect.left;
        var cursorY = e.clientY - rect.top;

        // Adjust pan so the point under the cursor stays fixed
        var scale = newZoom / targetZoom;
        targetPanX = cursorX - scale * (cursorX - targetPanX);
        targetPanY = cursorY - scale * (cursorY - targetPanY);
        targetZoom = newZoom;

        if (!zoomAnimId) zoomAnimId = requestAnimationFrame(animateZoom);
    }, { passive: false });

    // ---- Mouse drag pan ----
    canvas.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        isPanning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        // Cancel any running zoom animation so drag feels direct
        if (zoomAnimId) { cancelAnimationFrame(zoomAnimId); zoomAnimId = null; }
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
        if (!isPanning) return;
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        targetPanX = panX;
        targetPanY = panY;
        applyZoomPan();
    });

    window.addEventListener('mouseup', function () {
        if (isPanning) {
            isPanning = false;
            document.getElementById('vizCanvas').style.cursor = 'grab';
        }
    });

    // ---- Touch: pinch-to-zoom + single-finger pan ----
    var touchState = { startDist: 0, startZoom: 1, startPanX: 0, startPanY: 0, startMidX: 0, startMidY: 0, panning: false };

    function touchDist(t1, t2) {
        var dx = t1.clientX - t2.clientX;
        var dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    canvas.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) {
            touchState.panning = true;
            touchState.startPanX = e.touches[0].clientX - panX;
            touchState.startPanY = e.touches[0].clientY - panY;
        } else if (e.touches.length === 2) {
            touchState.panning = false;
            touchState.startDist = touchDist(e.touches[0], e.touches[1]);
            touchState.startZoom = zoomLevel;
            var rect = svg.getBoundingClientRect();
            touchState.startMidX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
            touchState.startMidY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
            touchState.startPanX = panX;
            touchState.startPanY = panY;
        }
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
        if (e.touches.length === 1 && touchState.panning) {
            panX = e.touches[0].clientX - touchState.startPanX;
            panY = e.touches[0].clientY - touchState.startPanY;
            targetPanX = panX;
            targetPanY = panY;
            applyZoomPan();
        } else if (e.touches.length === 2) {
            var dist = touchDist(e.touches[0], e.touches[1]);
            var newZoom = Math.min(5, Math.max(0.05, touchState.startZoom * (dist / touchState.startDist)));
            var scale = newZoom / touchState.startZoom;
            panX = touchState.startMidX - scale * (touchState.startMidX - touchState.startPanX);
            panY = touchState.startMidY - scale * (touchState.startMidY - touchState.startPanY);
            zoomLevel = newZoom;
            targetZoom = newZoom;
            targetPanX = panX;
            targetPanY = panY;
            applyZoomPan();
        }
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', function (e) {
        if (e.touches.length < 2) touchState.panning = false;
        if (e.touches.length === 1) {
            touchState.panning = true;
            touchState.startPanX = e.touches[0].clientX - panX;
            touchState.startPanY = e.touches[0].clientY - panY;
        }
    });
}

// ============================================================
// Tab key support helper
// ============================================================
function handleEditorKeydown(e) {
    var editor = e.target;

    // Tab -> insert 4 spaces
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        var start = editor.selectionStart;
        var end = editor.selectionEnd;

        if (e.shiftKey) {
            // Shift+Tab: dedent current line(s)
            var val = editor.value;
            var lineStart = val.lastIndexOf('\n', start - 1) + 1;
            var lineText = val.substring(lineStart, end);
            // Remove up to 4 leading spaces from each selected line
            var before = val.substring(0, lineStart);
            var after = val.substring(end);
            var lines = lineText.split('\n');
            var removed = 0;
            var dedented = lines.map(function (line, idx) {
                var m = line.match(/^( {1,4})/);
                if (m) {
                    if (idx === 0) removed = m[1].length;
                    return line.substring(m[1].length);
                }
                return line;
            });
            editor.value = before + dedented.join('\n') + after;
            editor.selectionStart = Math.max(lineStart, start - removed);
            editor.selectionEnd = lineStart + dedented.join('\n').length;
        } else {
            // Insert 4 spaces at cursor
            var before2 = editor.value.substring(0, start);
            var after2 = editor.value.substring(end);
            editor.value = before2 + '    ' + after2;
            editor.selectionStart = editor.selectionEnd = start + 4;
        }
        return;
    }

    // Enter -> auto-indent: match leading spaces of current line
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        var s = editor.selectionStart;
        var v = editor.value;
        var lineBegin = v.lastIndexOf('\n', s - 1) + 1;
        var currentLine = v.substring(lineBegin, s);
        var indentMatch = currentLine.match(/^( +)/);
        var indent = indentMatch ? indentMatch[1] : '';
        // Extra indent after colon
        var trimmed = currentLine.trimEnd();
        if (trimmed.endsWith(':')) indent += '    ';
        var insertion = '\n' + indent;
        var bef = v.substring(0, s);
        var aft = v.substring(editor.selectionEnd);
        editor.value = bef + insertion + aft;
        editor.selectionStart = editor.selectionEnd = s + insertion.length;
        return;
    }

    // Ctrl+Enter -> run
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        if (!document.getElementById('runBtn').disabled) {
            runVisualization();
        }
        return;
    }
}

// ============================================================
// DOMContentLoaded – wire everything up
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    initPyodide();

    // Template selection
    document.getElementById('templateSelect').addEventListener('change', function (e) {
        var tmpl = templates[e.target.value];
        if (!tmpl) return;
        loadVariables(tmpl.variables);
        document.getElementById('codeEditor').value = tmpl.code;
        document.getElementById('functionCall').value = tmpl.call;
        addLog('Loaded template: ' + e.target.options[e.target.selectedIndex].text, 'success');
    });

    // Toggles
    document.querySelectorAll('.toggle').forEach(function (toggle) {
        toggle.addEventListener('click', function () { toggle.classList.toggle('active'); });
    });

    // Run button
    document.getElementById('runBtn').addEventListener('click', runVisualization);

    // Code editor keyboard
    document.getElementById('codeEditor').addEventListener('keydown', handleEditorKeydown);

    // Navigation
    document.getElementById('prevBtn').addEventListener('click', stepBack);
    document.getElementById('nextBtn').addEventListener('click', stepForward);
    document.getElementById('resetBtn').addEventListener('click', resetVisualization);

    // Playback controls
    document.getElementById('playPauseBtn').addEventListener('click', function () {
        if (isPlaying) stopPlayback(); else startPlayback();
    });
    document.getElementById('stepBackBtn').addEventListener('click', stepBack);
    document.getElementById('stepForwardBtn').addEventListener('click', stepForward);

    // Speed slider
    document.getElementById('speedSlider').addEventListener('input', function (e) {
        animationSpeed = 2100 - parseInt(e.target.value, 10);
        if (isPlaying) { stopPlayback(); startPlayback(); }
    });

    // Dark mode
    document.getElementById('darkToggle').addEventListener('click', function () {
        document.body.classList.toggle('dark-mode');
    });

    // Console toggle
    document.getElementById('consoleToggle').addEventListener('click', function () {
        if (document.getElementById('consoleToggle').classList.contains('active')) {
            document.getElementById('outputConsole').classList.add('visible');
        } else {
            document.getElementById('outputConsole').classList.remove('visible');
        }
    });

    // Expand/Collapse
    document.getElementById('expandBtn').addEventListener('click', function () {
        var lp = document.querySelector('.left-panel');
        if (!isExpanded) {
            lp.style.width = '0';
            lp.style.minWidth = '0';
            lp.style.overflow = 'hidden';
            lp.style.padding = '0';
        } else {
            lp.style.width = '';
            lp.style.minWidth = '';
            lp.style.overflow = '';
            lp.style.padding = '';
        }
        isExpanded = !isExpanded;
    });

    // Close help on click outside
    document.getElementById('helpModal').addEventListener('click', function (e) {
        if (e.target === this) closeHelp();
    });

    // Close error on click outside
    document.getElementById('errorModal').addEventListener('click', function (e) {
        if (e.target === this) closeErrorModal();
    });

    // Zoom & Pan
    initZoomPan();

    // Zoom reset button
    var zoomResetBtn = document.getElementById('zoomResetBtn');
    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', resetZoomPan);
    }

    // Initialise with subset template
    var initTemplate = templates['subset'];
    document.getElementById('templateSelect').value = 'subset';
    loadVariables(initTemplate.variables);
    document.getElementById('codeEditor').value = initTemplate.code;
    document.getElementById('functionCall').value = initTemplate.call;
});
