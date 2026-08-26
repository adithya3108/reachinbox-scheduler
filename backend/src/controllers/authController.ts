import type { Request, Response } from "express";

export function getMe(req: Request, res: Response) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: { message: "Not authenticated" } });
  }
  const user = req.user as any;
  return res.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });
}

export function logout(req: Request, res: Response) {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ data: { ok: true } });
    });
  });
}
