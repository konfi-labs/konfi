"use client";

import { Member } from "@konfi/types";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useConfigurationMembers } from "./configuration";

interface CurrentMemberContextType {
  currentMember: Member | null;
  setCurrentMember: (member: Member) => void;
  switchMember: (memberId: string) => void;
}

const CurrentMemberContext = createContext<
  CurrentMemberContextType | undefined
>(undefined);

export function CurrentMemberProvider({ children }: { children: ReactNode }) {
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const { members } = useConfigurationMembers();

  useEffect(() => {
    // Load from localStorage on mount
    const storedMemberId = localStorage.getItem("currentTeamChatMemberId");
    if (storedMemberId && members) {
      const member = members.find((m) => m.id === storedMemberId);
      if (member) {
        setCurrentMember(member);
      } else if (members.length > 0) {
        // If stored member not found, set first available member
        setCurrentMember(members[0]);
        localStorage.setItem("currentTeamChatMemberId", members[0].id);
      }
    } else if (members && members.length > 0 && !currentMember) {
      // Set first member as default if none selected
      setCurrentMember(members[0]);
      localStorage.setItem("currentTeamChatMemberId", members[0].id);
    }
  }, [members, currentMember]);

  const handleSetCurrentMember = (member: Member) => {
    setCurrentMember(member);
    localStorage.setItem("currentTeamChatMemberId", member.id);
  };

  const switchMember = (memberId: string) => {
    if (members) {
      const member = members.find((m) => m.id === memberId);
      if (member) {
        handleSetCurrentMember(member);
      }
    }
  };

  return (
    <CurrentMemberContext.Provider
      value={{
        currentMember,
        setCurrentMember: handleSetCurrentMember,
        switchMember,
      }}
    >
      {children}
    </CurrentMemberContext.Provider>
  );
}

export const useCurrentMember = () => {
  const context = useContext(CurrentMemberContext);
  if (!context) {
    throw new Error(
      "useCurrentMember must be used within CurrentMemberProvider",
    );
  }
  return context;
};
