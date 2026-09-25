// Forces this file to be treated as a module (not a global script) so the
// `declare module` blocks below properly augment next-auth's real types
// instead of replacing them wholesale.
export {};

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name?: string | null;
    role?: string;
    type?: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role?: string;
      type?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name?: string | null;
    role?: string;
    type?: string;
  }
}
