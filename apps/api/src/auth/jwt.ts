import jwt from "jsonwebtoken";
import { env } from "../env.js";

export type AccessPayload = {
  sub: string;
  role: "USER" | "MODERATOR" | "ADMIN";
};

export type RefreshPayload = {
  sub: string;
};

export function signAccess(payload: AccessPayload): string {
  return jwt.sign({ sub: payload.sub, role: payload.role }, env.jwtAccessSecret, {
    expiresIn: "15m",
  });
}

export function signRefresh(payload: RefreshPayload): string {
  return jwt.sign({ sub: payload.sub }, env.jwtRefreshSecret, {
    expiresIn: "7d",
  });
}

export function verifyAccess(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.jwtAccessSecret) as jwt.JwtPayload;
  return {
    sub: decoded["sub"] as string,
    role: decoded["role"] as "USER" | "MODERATOR" | "ADMIN",
  };
}

export function verifyRefresh(token: string): RefreshPayload {
  const decoded = jwt.verify(token, env.jwtRefreshSecret) as jwt.JwtPayload;
  return {
    sub: decoded["sub"] as string,
  };
}
