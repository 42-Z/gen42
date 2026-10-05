import {
	IconExternalLink,
	IconLogin2,
	IconLogout,
	IconRefresh,
	IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { QuotaBar } from "@/components/QuotaBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
	CodexAdminState,
	CodexCheckResult,
	CodexLoginEvent,
} from "@/lib/turbo/codex-events";
import { cn } from "@/lib/utils";

interface PendingLogin {
	userCode: string;
	verificationUrl: string;
}

type Busy = "login" | "check" | "logout" | null;

interface Notice {
	tone: "ok" | "error";
	text: string;
}

function formatDate(iso: string | null): string {
	if (!iso) return "нет данных";
	return new Date(iso).toLocaleString("ru", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function plural(count: number, one: string, few: string, many: string): string {
	const mod100 = count % 100;
	const mod10 = count % 10;
	if (mod100 >= 11 && mod100 <= 14) return many;
	if (mod10 === 1) return one;
	if (mod10 >= 2 && mod10 <= 4) return few;
	return many;
}

/** «5 часов», «7 дней» — по длине окна лимита подписки */
function windowLabel(seconds: number): string {
	if (seconds >= 86_400) {
		const days = Math.round(seconds / 86_400);
		return `${days} ${plural(days, "день", "дня", "дней")}`;
	}
	const hours = Math.max(1, Math.round(seconds / 3_600));
	return `${hours} ${plural(hours, "час", "часа", "часов")}`;
}

/** Вход подписки ChatGPT для режима «Турбо»: один вход обслуживает и агента, и картинки */
export function CodexAccess() {
	const [status, setStatus] = useState<CodexAdminState | null>(null);
	const [pending, setPending] = useState<PendingLogin | null>(null);
	const [busy, setBusy] = useState<Busy>(null);
	const [notice, setNotice] = useState<Notice | null>(null);
	const loginAbort = useRef<AbortController | null>(null);

	useEffect(() => {
		void loadStatus();
		return () => loginAbort.current?.abort();
	}, []);

	async function loadStatus() {
		try {
			const res = await fetch("/api/admin/codex");
			if (res.ok) setStatus(await res.json());
		} catch (error) {
			console.error("Не удалось получить состояние входа Codex:", error);
		}
	}

	function handleLoginEvent(event: CodexLoginEvent) {
		if (event.type === "code") {
			setPending({
				userCode: event.userCode,
				verificationUrl: event.verificationUrl,
			});
		} else if (event.type === "done") {
			setNotice({ tone: "ok", text: "Вход выполнен" });
		} else if (event.type === "error") {
			setNotice({ tone: "error", text: event.message });
		}
	}

	async function login() {
		const controller = new AbortController();
		loginAbort.current = controller;
		setBusy("login");
		setNotice(null);
		try {
			const res = await fetch("/api/admin/codex/login", {
				method: "POST",
				signal: controller.signal,
			});
			if (!res.ok || !res.body) throw new Error("Не удалось начать вход");

			const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
			let buffer = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += value;
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					if (line.trim()) handleLoginEvent(JSON.parse(line));
				}
			}
		} catch (error) {
			if (!controller.signal.aborted) {
				setNotice({
					tone: "error",
					text: error instanceof Error ? error.message : "Вход не удался",
				});
			}
		} finally {
			loginAbort.current = null;
			setPending(null);
			setBusy(null);
			void loadStatus();
		}
	}

	async function check() {
		setBusy("check");
		setNotice(null);
		try {
			const res = await fetch("/api/admin/codex/check", { method: "POST" });
			const result: CodexCheckResult | { error: string } = await res.json();
			if ("ok" in result && result.ok) {
				setNotice({
					tone: "ok",
					text: `Вход рабочий, моделей на аккаунте: ${result.models.length}`,
				});
			} else {
				setNotice({
					tone: "error",
					text: "error" in result ? result.error : "Проверка не пройдена",
				});
			}
		} catch {
			setNotice({ tone: "error", text: "Проверка не удалась" });
		} finally {
			setBusy(null);
			void loadStatus();
		}
	}

	async function logout() {
		if (!window.confirm("Выйти из Codex? Режим «Турбо» пропадёт у всех.")) {
			return;
		}
		setBusy("logout");
		setNotice(null);
		try {
			await fetch("/api/admin/codex", { method: "DELETE" });
		} finally {
			setBusy(null);
			void loadStatus();
		}
	}

	const loggedIn = status?.loggedIn ?? false;
	const healthy = loggedIn && !status?.lastError;
	const nearestReset =
		status?.usage?.windows
			.map((quota) => quota.resetAt)
			.sort()
			.at(0) ?? null;

	return (
		<section className="animate-pop-in pop-card mt-6 p-6 [animation-delay:280ms]">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="font-display text-xl font-bold text-foreground">
					Вход Codex
				</h3>
				{status && (
					<Badge
						variant={
							healthy ? "default" : loggedIn ? "destructive" : "secondary"
						}
					>
						{healthy
							? "Турбо работает"
							: loggedIn
								? "Нужна проверка"
								: "Вход не выполнен"}
					</Badge>
				)}
			</div>

			<p className="mt-3 max-w-prose text-sm text-muted-foreground">
				Подписка ChatGPT, через которую работает режим «Турбо». Пока входа нет
				или он нерабочий, пользователи режима не видят.
			</p>

			{status && loggedIn && (
				<dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
					<dt className="text-muted-foreground">Тариф</dt>
					<dd className="text-foreground">{status.planType ?? "неизвестен"}</dd>
					<dt className="text-muted-foreground">Обновлён</dt>
					<dd className="text-foreground">{formatDate(status.updatedAt)}</dd>
					{status.lastError && (
						<>
							<dt className="text-muted-foreground">Ошибка</dt>
							<dd className="break-words text-destructive">
								{status.lastError}
							</dd>
						</>
					)}
				</dl>
			)}

			{status?.usage && status.usage.windows.length > 0 && (
				<div className="mt-6">
					<p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
						Лимит подписки
					</p>
					<div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
						{status.usage.windows.map((quota) => (
							<div key={quota.windowSeconds}>
								<div className="flex items-baseline justify-between gap-2">
									<span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
										{windowLabel(quota.windowSeconds)}
									</span>
									<span className="font-display text-2xl font-extrabold tabular-nums text-foreground">
										{quota.remainingPercent}%
										<span className="text-base font-bold text-muted-foreground">
											{" "}
											осталось
										</span>
									</span>
								</div>
								<QuotaBar
									className="mt-3 w-full"
									remaining={quota.remainingPercent}
									total={100}
									title={`Осталось ${quota.remainingPercent}% лимита`}
								/>
							</div>
						))}
					</div>
					{nearestReset && (
						<p className="mt-5 text-sm text-muted-foreground">
							Ближайший сброс лимита — {formatDate(nearestReset)}
						</p>
					)}
				</div>
			)}

			{pending && (
				<div className="mt-5 flex flex-col gap-3 rounded-[22px] border border-border bg-secondary/60 p-5">
					<p className="text-sm text-muted-foreground">
						Откройте ссылку, войдите в нужный аккаунт ChatGPT и введите код.
					</p>
					<p className="font-mono text-3xl font-bold tracking-widest text-foreground">
						{pending.userCode}
					</p>
					<div className="flex flex-wrap gap-2">
						<Button asChild variant="outline" size="sm">
							<a
								href={pending.verificationUrl}
								target="_blank"
								rel="noreferrer"
							>
								<IconExternalLink data-icon="inline-start" />
								Открыть страницу входа
							</a>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => loginAbort.current?.abort()}
						>
							<IconX data-icon="inline-start" />
							Отмена
						</Button>
					</div>
				</div>
			)}

			{notice && (
				<p
					role={notice.tone === "error" ? "alert" : "status"}
					className={cn(
						"mt-4 text-sm",
						notice.tone === "ok" ? "text-primary" : "text-destructive",
					)}
				>
					{notice.text}
				</p>
			)}

			<div className="mt-6 flex flex-wrap gap-2">
				<Button onClick={login} disabled={busy !== null}>
					<IconLogin2 data-icon="inline-start" />
					{loggedIn ? "Войти заново" : "Войти"}
				</Button>
				<Button
					variant="outline"
					onClick={check}
					disabled={busy !== null || !loggedIn}
				>
					<IconRefresh data-icon="inline-start" />
					Проверить
				</Button>
				<Button
					variant="ghost"
					onClick={logout}
					disabled={busy !== null || !loggedIn}
					className="text-destructive hover:text-destructive"
				>
					<IconLogout data-icon="inline-start" />
					Выйти
				</Button>
			</div>
		</section>
	);
}
