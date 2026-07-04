"use client";

import { useT } from "@/i18n/client";
import { auth } from "@/lib/firebase/clientApp";
import { TotpMfaForm as SharedTotpMfaForm } from "@konfi/components";

const TotpMfaForm = () => {
  const { t } = useT();

  return (
    <SharedTotpMfaForm auth={auth} t={t} defaultIssuerName="Konfi Admin" />
  );
};

export default TotpMfaForm;
