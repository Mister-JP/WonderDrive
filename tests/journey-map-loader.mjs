const harnessKey = "__CURIOSITYPEDIA_JOURNEY_MAP_HARNESS__";

function moduleUrl(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

const reactModule = moduleUrl(`
const harness = () => globalThis.${harnessKey};
export const useState = (initial) => harness().useState(initial);
export const useRef = (initial) => harness().useRef(initial);
export const useMemo = (factory) => factory();
export const useCallback = (callback) => callback;
export const useEffect = () => undefined;
`);

const jsxRuntimeModule = moduleUrl(`
export const Fragment = Symbol.for("curiositypedia.test.fragment");
export function jsx(type, props, key) { return { type, key: key ?? null, props: props ?? {} }; }
export const jsxs = jsx;
`);

const icons = [
  "ArrowLeft", "ArrowRight", "ArrowsClockwise", "BookmarkSimple", "CaretDown", "Check",
  "CaretRight", "CornersOut", "Crosshair", "ListBullets", "MagnifyingGlass",
  "MagicWand", "Minus", "Path", "PencilSimple", "Plus", "TreeStructure", "X",
];
const phosphorModule = moduleUrl(icons.map((name) => `export const ${name} = ${JSON.stringify(name)};`).join("\n"));

const navigationModule = moduleUrl(`
export const usePathname = () => "/";
export const useRouter = () => ({ push() {}, replace() {} });
export const useSearchParams = () => new URLSearchParams();
`);

const i18nModule = moduleUrl(`
function format(key, values = {}) {
  return String(key).replace(/\\{([^}]+)\\}/g, (_, name) => String(values[name] ?? "{" + name + "}"));
}
export const translate = (_locale, key, values) => format(key, values);
export const useI18n = () => ({ locale: "en", direction: "ltr", t: format });
export const I18nProvider = "I18nProvider";
`);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "react") return { url: reactModule, shortCircuit: true };
  if (specifier === "react/jsx-runtime") return { url: jsxRuntimeModule, shortCircuit: true };
  if (specifier === "@phosphor-icons/react") return { url: phosphorModule, shortCircuit: true };
  if (specifier === "next/navigation") return { url: navigationModule, shortCircuit: true };

  const resolved = await nextResolve(specifier, context);
  if (resolved.url.endsWith("/app/i18n.tsx")) return { url: i18nModule, shortCircuit: true };
  return resolved;
}
