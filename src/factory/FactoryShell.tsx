import { Children, type ReactNode } from "react";
import { useI18n, type MessageKey } from "../i18n";
import {
  factoryPages,
  WorkspaceLink,
  type FactoryPage,
  type WorkspaceNavigation,
} from "./navigation";
import { withAppearanceSettings } from "./Preferences";
import "./tokens.css";
import "./shell.css";

const navigationKeys = {
  library: "shell.nav.library",
  studio: "shell.nav.studio",
  automation: "shell.nav.automation",
  settings: "shell.nav.settings",
} as const satisfies Record<FactoryPage, MessageKey>;

type ConnectionKey =
  | "shell.status.offline"
  | "shell.status.workerOnline"
  | "shell.status.browserLocal";

export function FactoryShell({
  page,
  visible,
  navigation,
  connection,
  player,
  children,
}: {
  page: FactoryPage;
  visible: boolean;
  navigation: WorkspaceNavigation;
  connection: ConnectionKey;
  player: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="factory-shell" hidden={!visible}>
      <a className="factory-skip" href="#factory-page-title">
        跳到主要内容
      </a>
      <div className="factory-shell-layout">
        <header className="factory-bar">
          <WorkspaceLink
            className="factory-brand"
            page="library"
            navigation={navigation}
          >
            <span aria-hidden="true">▥</span>
            Podcast Studio
          </WorkspaceLink>
          <div className="factory-bar-actions">
            <span className="factory-status" role="status">
              {t(connection)}
            </span>
          </div>
        </header>
        <nav className="factory-nav" aria-label={t("shell.nav.label")}>
          {(Object.keys(navigationKeys) as FactoryPage[]).map((key) => (
            <WorkspaceLink
              key={key}
              page={key}
              navigation={navigation}
              aria-current={key === page ? "page" : undefined}
            >
              {t(navigationKeys[key])}
            </WorkspaceLink>
          ))}
        </nav>
        <main className="factory-main" aria-labelledby="factory-page-title">
          <div className="factory-intro">
            <h1 id="factory-page-title" tabIndex={-1}>
              {factoryPages[page].title}
            </h1>
            {page === "library" && <p>在此浏览器保存、播放与编辑节目。</p>}
            {page === "automation" && <p>自动化仅限本机制作进程。</p>}
          </div>
          {Children.map(children, withAppearanceSettings)}
        </main>
      </div>
      {player}
    </div>
  );
}
