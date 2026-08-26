import type { User } from "../types";

export function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-semibold">
          {user.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="text-sm leading-tight">
        <p className="font-medium text-slate-800">{user.name}</p>
        <p className="text-slate-400">{user.email}</p>
      </div>
      <button
        onClick={onLogout}
        className="ml-2 text-sm text-slate-500 hover:text-red-600"
      >
        Logout
      </button>
    </div>
  );
}
