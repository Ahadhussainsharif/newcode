const fs = require('fs');
const vm = require('vm');

function createDeepStub() {
	const handler = {
		get(target, prop) {
			if (prop === Symbol.toPrimitive) {
				return () => '';
			}
			if (prop === 'then') {
				return undefined;
			}
			return proxy;
		},
		apply() {
			return proxy;
		},
		construct() {
			return proxy;
		},
		set() {
			return true;
		},
		has() {
			return true;
		},
	};
	const proxy = new Proxy(function () {}, handler);
	return proxy;
}

function makeContext() {
	const stub = createDeepStub();
	const noop = () => {};
	const noopNum = () => 0;
	const asyncOk = async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({}) });
	const xhr = function () {
		return {
			open: noop,
			send: noop,
			setRequestHeader: noop,
			onreadystatechange: null,
			readyState: 4,
			status: 200,
			responseText: '',
		};
	};
	const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };

	const contextObj = {
		console,
		setTimeout: noopNum,
		setInterval: noopNum,
		clearTimeout: noop,
		clearInterval: noop,
		requestAnimationFrame: noopNum,
		cancelAnimationFrame: noop,
		fetch: asyncOk,
		XMLHttpRequest: xhr,
		navigator: {},
		localStorage: storage,
		sessionStorage: storage,
		location: {},
		history: { pushState: noop, replaceState: noop },
		alert: noop,
		confirm: () => false,
		prompt: () => '',
		document: stub,
		window: stub,
		global: undefined,
		globalThis: undefined,
		module: { exports: {} },
		exports: {},
		require: undefined,
		process: { env: {}, versions: {}, argv: [] },
	};
	const context = vm.createContext(contextObj, { name: 'sandbox' });
	context.globalThis = context;
	context.window = context;
	context.global = context;
	return context;
}

function collectAliases(source, baseFnName) {
	const aliasSet = new Set([baseFnName]);
	const aliasRegex = new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*${baseFnName}\b`, 'g');
	let m;
	while ((m = aliasRegex.exec(source))) {
		aliasSet.add(m[1]);
	}
	return aliasSet;
}

function buildAliasPattern(aliasSet) {
	const names = Array.from(aliasSet).sort((a, b) => b.length - a.length).map(n => n.replace(/[$]/g, '\\$&'));
	return new RegExp(String.raw`\b(?:${names.join('|')})\s*\(\s*(0x[0-9a-fA-F]+)\s*(?:,[^)]*)?\)`, 'g');
}

function decodeWith(fn, hexStr) {
	const n = Number(hexStr);
	try {
		return fn(n);
	} catch (e) {
		return undefined;
	}
}

function replaceAll(source, pattern, decodeFn) {
	return source.replace(pattern, (full, hex) => {
		let val;
		try {
			val = decodeFn(hex);
		} catch (e) {}
		if (typeof val === 'string') {
			return JSON.stringify(val);
		}
		return full;
	});
}

function parseArgs(argv) {
	const args = { input: undefined, output: undefined, mapping: undefined };
	const rest = [];
	for (const a of argv.slice(2)) {
		if (a.startsWith('--mapping=')) args.mapping = a.slice('--mapping='.length);
		else rest.push(a);
	}
	args.input = rest[0] || '/workspace/newcode.readable.js';
	args.output = rest[1] || (args.input.replace(/\.[^/.]+$/, '') + '.deobfuscated.js');
	return args;
}

function main() {
	const { input, output, mapping } = parseArgs(process.argv);
	const code = fs.readFileSync(input, 'utf8');

	const context = makeContext();
	let evalSource = code;
	if (mapping) {
		try {
			evalSource = fs.readFileSync(mapping, 'utf8');
		} catch {}
	}
	if (evalSource) {
		vm.runInContext(evalSource, context, { timeout: 120000 });
	}

	const alias4b43 = collectAliases(code, '_0x4b43');
	const alias4aa5 = collectAliases(code, '_0x4aa5');
	const aliasB17f = collectAliases(code, '_0xb17f');

	let out = code;
	if (typeof context._0x4b43 === 'function') {
		const pat = buildAliasPattern(alias4b43);
		out = replaceAll(out, pat, (hex) => decodeWith(context._0x4b43, hex));
	}
	if (typeof context._0x4aa5 === 'function') {
		const pat = buildAliasPattern(alias4aa5);
		out = replaceAll(out, pat, (hex) => decodeWith(context._0x4aa5, hex));
	}
	if (typeof context._0xb17f === 'function') {
		const pat = buildAliasPattern(aliasB17f);
		out = replaceAll(out, pat, (hex) => decodeWith(context._0xb17f, hex));
	}

	fs.writeFileSync(output, out, 'utf8');
	console.log('Deobfuscated output written to', output);
}

if (require.main === module) {
	main();
}