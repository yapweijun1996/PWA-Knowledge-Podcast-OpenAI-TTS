import type { ReactNode } from "react";
import {
  factoryPages,
  WorkspaceLink,
  type FactoryPage,
  type WorkspaceNavigation,
} from "./navigation";
import "./tokens.css";
import "./shell.css";

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
  connection: string;
  player: ReactNode;
  children: ReactNode;
}) {
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
              {connection}
            </span>
            <WorkspaceLink page="local" navigation={navigation}>
              本地编辑器
            </WorkspaceLink>
          </div>
        </header>
        <nav className="factory-nav" aria-label="播客工作区导航">
          {Object.entries(factoryPages).map(([key, { label }]) => (
            <WorkspaceLink
              key={key}
              page={key as FactoryPage}
              navigation={navigation}
              aria-current={key === page ? "page" : undefined}
            >
              {label}
            </WorkspaceLink>
          ))}
        </nav>
        <main className="factory-main" aria-labelledby="factory-page-title">
          <div className="factory-intro">
            <h1 id="factory-page-title" tabIndex={-1}>
              {factoryPages[page].title}
            </h1>
            {page === "library" && <p>在此浏览器保存、播放与编辑节目。</p>}
          </div>
          {children}
        </main>
      </div>
      {player}
    </div>
  );
}
