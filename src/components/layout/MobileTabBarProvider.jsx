import React, { createContext, useContext, useRef } from 'react';

const TabHistoryContext = createContext();

export function MobileTabBarProvider({ children }) {
  const historyRef = useRef({
    '/Dashboard': ['/Dashboard'],
    '/Chat': ['/Chat'],
    '/DirectMessages': ['/DirectMessages'],
    '/Profile': ['/Profile'],
  });

  const saveNavigation = (tab, path) => {
    if (!historyRef.current[tab]) {
      historyRef.current[tab] = [];
    }
    if (historyRef.current[tab][historyRef.current[tab].length - 1] !== path) {
      historyRef.current[tab].push(path);
    }
  };

  const getHistory = (tab) => historyRef.current[tab] || [];
  const getLastPath = (tab) => {
    const history = historyRef.current[tab];
    return history && history.length > 0 ? history[history.length - 1] : tab;
  };

  return (
    <TabHistoryContext.Provider value={{ saveNavigation, getHistory, getLastPath }}>
      {children}
    </TabHistoryContext.Provider>
  );
}

export function useTabHistory() {
  return useContext(TabHistoryContext);
}