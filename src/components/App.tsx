import { IconLogout, IconSettings, IconUserCircle } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Admin } from "./Admin";
import { Auth } from "./Auth";
import { Generate } from "./Generate";
import { PopLogo } from "./graphics";
import { Balance } from "./sheet/Balance";
import { Sheet, useSheetRuntime } from "./sheet/Sheet";

interface User {
	id: string;
	email: string;
	name?: string;
	isAdmin?: boolean;
}

type View = "main" | "admin";

function viewFromHash(): View {
	const h = window.location.hash.replace(/^#\/?/, "");
	if (h === "admin") return "admin";
	return "main";
}

export function App() {
	useSheetRuntime();
	const [user, setUser] = useState<User | null>(null);
	const [balance, setBalance] = useState<number | null>(null);
	const [view, setView] = useState<View>(() => viewFromHash());
	const [loading, setLoading] = useState(true);
	// Роль (isAdmin) резолвится отдельным запросом /api/me, который может
	// прийти позже навигации (холодный старт БД). До готовности роли
	// никого никуда не редиректим.
	const [rolesReady, setRolesReady] = useState(false);

	useEffect(() => {
		checkSession();
	}, []);

	useEffect(() => {
		function onHash() {
			setView(viewFromHash());
		}
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);

	// Админка только для админа: чужим — на главный экран.
	// Ждём готовности роли, чтобы не выкидывать админа при медленном /api/me.
	useEffect(() => {
		if (rolesReady && user && view === "admin" && !user.isAdmin) {
			window.location.hash = "#/";
		}
	}, [view, user, rolesReady]);

	async function refreshBalance() {
		try {
			const res = await fetch("/api/me");
			if (res.ok) {
				const me = await res.json();
				if (typeof me.balance === "number") setBalance(me.balance);
			}
		} catch {
			/* баланс подтянется при следующей загрузке */
		}
	}

	async function checkSession() {
		try {
			const res = await fetch("/api/auth/get-session");
			if (res.ok) {
				const data = await res.json();
				if (data?.user) {
					const meRes = await fetch("/api/me");
					const me = meRes.ok
						? await meRes.json()
						: { is_admin: false, balance: null };
					setUser({ ...data.user, isAdmin: me.is_admin });
					setBalance(me.balance ?? null);
				}
				setRolesReady(true);
			}
		} catch (error) {
			console.error("Session check failed:", error);
		} finally {
			setLoading(false);
		}
	}

	async function handleLogin(loggedUser: any) {
		setUser(loggedUser);
		try {
			const meRes = await fetch("/api/me");
			if (meRes.ok) {
				const me = await meRes.json();
				setUser({ ...loggedUser, isAdmin: me.is_admin });
				if (typeof me.balance === "number") setBalance(me.balance);
				setRolesReady(true);
				return;
			}
		} catch {
			/* ниже — запасной путь через refreshBalance */
		}
		await refreshBalance();
		setRolesReady(true);
	}

	async function handleLogout() {
		await fetch("/api/auth/sign-out", { method: "POST" });
		setUser(null);
		setBalance(null);
		window.location.hash = "#/";
	}

	if (loading) {
		return (
			<div className="relative isolate flex min-h-screen w-full items-center justify-center">
				<Sheet />
				<div
					role="status"
					aria-label="Загрузка"
					data-sheet="ridge"
					data-loading="true"
					className="h-3 w-28 rounded-full"
				>
					<i className="sheet-layer" aria-hidden="true" />
				</div>
			</div>
		);
	}

	if (!user) {
		return <Auth onLogin={handleLogin} />;
	}

	return (
		<div className="relative isolate min-h-screen w-full">
			<Sheet />
			<header className="border-b border-border/60">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:flex-wrap sm:gap-4 sm:px-6 sm:py-4">
					<a href="#/" aria-label="gen42 — на главную">
						<PopLogo />
					</a>

					<div className="flex items-center gap-3">
						{balance === null ? (
							<div
								className="h-8 w-16 rounded-full bg-secondary/60"
								aria-hidden
							/>
						) : (
							<Balance value={balance} />
						)}
						<AccountMenu user={user} onLogout={handleLogout} />
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-6 py-12">
				{view === "admin" ? (
					user?.isAdmin ? (
						<Admin />
					) : !rolesReady ? (
						<div
							className="flex items-center justify-center py-24"
							aria-label="Загрузка"
						>
							<div
								data-sheet="ridge"
								data-loading="true"
								className="h-2.5 w-20 rounded-full"
							>
								<i className="sheet-layer" aria-hidden="true" />
							</div>
						</div>
					) : (
						<Generate balance={balance} onBalanceChange={setBalance} />
					)
				) : (
					<Generate balance={balance} onBalanceChange={setBalance} />
				)}
			</main>
		</div>
	);
}

function AccountMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		function onPointer(e: PointerEvent) {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onPointer);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onPointer);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="relative">
			<Button
				type="button"
				variant="outline"
				size="icon"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label="Аккаунт"
				weight={0.3}
			>
				<IconUserCircle className="size-5" />
			</Button>
			{open && (
				<div
					role="menu"
					aria-label="Аккаунт"
					className="animate-pop-in absolute right-0 top-full z-50 mt-2 w-60 rounded-[22px] border border-border bg-popover p-2"
				>
					<p
						className="truncate px-3 pb-2 pt-1.5 text-xs text-muted-foreground"
						title={user.email}
					>
						{user.email}
					</p>
					{user.isAdmin && (
						<a
							role="menuitem"
							data-impulse="tap"
							data-weight="0.2"
							href="#/admin"
							onClick={() => setOpen(false)}
							className="flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm text-foreground transition-colors outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
						>
							<IconSettings className="h-4 w-4 text-muted-foreground" />
							Админка
						</a>
					)}
					<button
						type="button"
						role="menuitem"
						data-impulse="tap"
						data-weight="0.2"
						onClick={() => {
							setOpen(false);
							onLogout();
						}}
						className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm text-foreground transition-colors outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
					>
						<IconLogout className="h-4 w-4 text-muted-foreground" />
						Выйти
					</button>
				</div>
			)}
		</div>
	);
}
