import {
  useEffect,
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
type Page = FactoryPage;
export const privateBuild = import.meta.env.MODE === "private";

function factoryPage(url: URL): FactoryPage {
  const view = url.searchParams.get("view");
  return view === "studio" || view === "automation" || view === "settings"
    ? view
    : "library";
}

function currentPage(): Page {
  return factoryPage(new URL(location.href));
}

export function useWorkspaceNavigation() {
  const [page, setPage] = useState(currentPage);

  useEffect(() => {
    const sync = () => setPage(currentPage());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function href(target: Page) {
    const url = new URL(location.href);
    if (target === currentPage()) return url.pathname + url.search + url.hash;
    url.hash = "";
    url.searchParams.set("studio", "factory");
    if (target === "library") url.searchParams.delete("view");
    else url.searchParams.set("view", target);
    return url.pathname + url.search + url.hash;
  }

  function go(target: Page) {
    if (target === currentPage()) return;
    history.pushState(null, "", href(target));
    setPage(currentPage());
  }

  return { page, href, go };
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
