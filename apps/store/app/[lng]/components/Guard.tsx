import { Center, Spinner } from "@chakra-ui/react";
import { isNull } from "es-toolkit";
import { getIdTokenResult } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth";

export function UserAuthGuard({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement<any> | null {
  const { loading, user, redirect, logout } = useAuth();
  const [isUser, setIsUser] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const lng = (params?.lng as string) || "en";

  useEffect(() => {
    async function checkIfUser() {
      try {
        if (isNull(user)) return;
        const idTokenResult = await getIdTokenResult(user);
        if (!!idTokenResult) {
          setIsUser(true);
        } else {
          logout();
          redirect(pathname ?? "/");
          setIsUser(false);
          router.push(`/${lng}/auth/login`);
        }
      } catch (error) {
        console.error(error);
      }
    }
    if (!loading) {
      if (!user) {
        redirect(pathname ?? "/");
        router.push(`/${lng}/auth/login`);
      } else checkIfUser();
    }
  }, [loading, router, user, redirect, logout, pathname]);

  if (loading) {
    return (
      <Center h="100vh">
        <Spinner size="xl" color={{ base: "blackAlpha.300", _dark: "whiteAlpha.300" }} />
      </Center>
    );
  }

  if (!loading && user && isUser) return <>{children}</>;

  return null;
}
