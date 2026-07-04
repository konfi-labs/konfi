"use client";

import { createContext, useContext } from "react";

interface ICourierNavigation {
  openMenu: () => void;
}

const CourierNavigationContext = createContext<ICourierNavigation>({
  openMenu: () => {},
});

export const useCourierNavigation = () => useContext(CourierNavigationContext);

export const CourierNavigationProvider = ({
  children,
  openMenu,
}: {
  children: React.ReactNode;
  openMenu: () => void;
}) => {
  return (
    <CourierNavigationContext.Provider value={{ openMenu }}>
      {children}
    </CourierNavigationContext.Provider>
  );
};
