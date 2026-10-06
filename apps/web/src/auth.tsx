import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
const localAuth = !poolId || !clientId || import.meta.env.VITE_LOCAL_AUTH === "true";

type AuthState = {
  ready: boolean;
  localMode: boolean;
  email: string | null;
  idToken: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  bypassLocal: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function getPool() {
  if (!poolId || !clientId) return null;
  return new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    if (localAuth) {
      const saved = localStorage.getItem("pocketbook.localAuth");
      if (saved) {
        setEmail(saved);
        setIdToken("local");
      }
      setReady(true);
      return;
    }
    const pool = getPool();
    const user = pool?.getCurrentUser();
    if (!user) {
      setReady(true);
      return;
    }
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (!err && session?.isValid()) {
        setEmail(user.getUsername());
        setIdToken(session.getIdToken().getJwtToken());
      }
      setReady(true);
    });
  }, []);

  const signIn = useCallback(async (userEmail: string, password: string) => {
    if (localAuth) {
      localStorage.setItem("pocketbook.localAuth", userEmail);
      setEmail(userEmail);
      setIdToken("local");
      return;
    }
    const pool = getPool();
    if (!pool) throw new Error("Cognito not configured");
    const user = new CognitoUser({ Username: userEmail, Pool: pool });
    const details = new AuthenticationDetails({ Username: userEmail, Password: password });
    await new Promise<void>((resolve, reject) => {
      user.authenticateUser(details, {
        onSuccess: (session) => {
          setEmail(userEmail);
          setIdToken(session.getIdToken().getJwtToken());
          resolve();
        },
        onFailure: (err) => reject(err),
        newPasswordRequired: () => reject(new Error("New password required — set it in Cognito console")),
      });
    });
  }, []);

  const signOut = useCallback(() => {
    if (localAuth) {
      localStorage.removeItem("pocketbook.localAuth");
    } else {
      getPool()?.getCurrentUser()?.signOut();
    }
    setEmail(null);
    setIdToken(null);
  }, []);

  const bypassLocal = useCallback(() => {
    localStorage.setItem("pocketbook.localAuth", "local@pocketbook.dev");
    setEmail("local@pocketbook.dev");
    setIdToken("local");
  }, []);

  const value = useMemo(
    () => ({
      ready,
      localMode: localAuth,
      email,
      idToken,
      signIn,
      signOut,
      bypassLocal,
    }),
    [ready, email, idToken, signIn, signOut, bypassLocal],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
