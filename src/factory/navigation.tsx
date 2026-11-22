import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";

export const factoryPages = {
  library: { label: "资料库", title: "播客资料库" },
  studio: { label: "制作台", title: "播客制作台" },
  automation: { label: "自动化", title: "自动化" },
  settings: { label: "设置", title: "设置" },
};

export type FactoryPage = keyof typeof factoryPages;
type Page = FactoryPage | "local";
export const privateBuild = import.meta.env.MODE === "private";

function factoryPage(url: URL): FactoryPage {
  const view = url.searchParams.get("view");
  return view === "studio" || view === "automation" || view === "settings"
    ? view
    : "library";
}

function currentPage(): Page {
  const url = new URL(location.href);
  const mode = url.searchParams.get("studio");
  return mode === "factory" || (privateBuild && mode !== "local")
    ? factoryPage(url)
    : "local";
}

export function useWorkspaceNavigation() {
  const localHash = useRef("");
  const [state, setState] = useState(() => {
    const page = currentPage();
    return {
      page,
      visitedLocal: page === "local",
      visitedFactory: page !== "local",
    };
  });

  function sync() {
    const page = currentPage();
    setState((previous) => ({
      page,
      visitedLocal: previous.visitedLocal || page === "local",
      visitedFactory: previous.visitedFactory || page !== "local",
    }));
  }

  useEffect(() => {
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function href(page: Page) {
    const url = new URL(location.href);
    if (page === currentPage()) return url.pathname + url.search + url.hash;
    url.hash = page === "local" ? localHash.current : "";
    url.searchParams.set("studio", page === "local" ? "local" : "factory");
    if (page === "library") url.searchParams.delete("view");
    else if (page !== "local") url.searchParams.set("view", page);
    return url.pathname + url.search + url.hash;
  }

  function go(page: Page) {
    const previous = currentPage();
    if (page === previous) return;
    if (previous === "local") localHash.current = location.hash;
    history.pushState(null, "", href(page));
    sync();
  }

  return {
    ...state,
    returnPage: factoryPage(new URL(location.href)),
    href,
    go,
  };
}

export type WorkspaceNavigation = ReturnType<typeof useWorkspaceNavigation>;

export function WorkspaceLink({
  page,
  navigation,
  ...props
}: Omit<ComponentPropsWithoutRef<"a">, "href" | "onClick"> & {
  page: Page;
  navigation: WorkspaceNavigation;
}) {
  return (
    <a
      {...props}
      href={navigation.href(page)}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.shiftKey
        )
          return;
        event.preventDefault();
        navigation.go(page);
      }}
    />
  );
}
