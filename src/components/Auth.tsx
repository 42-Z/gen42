import { IconAlertTriangle, IconArrowRight } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { impulse } from "@/lib/sheet/impulses";
import { springLinear } from "@/lib/sheet/springs";
import { PopLogo } from "./graphics";
import { Sheet } from "./sheet/Sheet";

interface AuthProps {
	onLogin: (user: any) => void;
}

export function Auth({ onLogin }: AuthProps) {
	const [isLogin, setIsLogin] = useState(true);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const formRef = useRef<HTMLDivElement>(null);
	const submitRef = useRef<HTMLButtonElement>(null);
	const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

	/** Корректное поле сдвигает лист кнопки отправки вперёд */
	function fieldOk(e: React.FormEvent<HTMLInputElement>) {
		if (e.currentTarget.validity.valid && submitRef.current) {
			impulse({
				source: submitRef.current,
				sign: 1,
				weight: 0.33,
				mass: "medium",
			});
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			const endpoint = isLogin
				? "/api/auth/sign-in/email"
				: "/api/auth/sign-up/email";
			const body = isLogin ? { email, password } : { email, password, name };

			const res = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || data.error || "Ошибка аутентификации");
			}

			const data = await res.json();
			if (!reduced()) {
				await formRef.current
					?.animate(
						[
							{ transform: "translate(0,0)", opacity: 1 },
							{ transform: "translate(-24px,0)", opacity: 0 },
						],
						{ duration: 260, easing: springLinear("medium"), fill: "forwards" },
					)
					.finished.catch(() => undefined);
			}
			onLogin(data.user);
		} catch (err: any) {
			setError(err.message);
			if (submitRef.current) {
				impulse({
					source: submitRef.current,
					sign: -1,
					weight: 0.4,
					mass: "medium",
				});
			}
			if (!reduced()) {
				formRef.current?.animate(
					[
						{ transform: "translate(0,0)" },
						{ transform: "translate(-6px,0)" },
						{ transform: "translate(5px,0)" },
						{ transform: "translate(-3px,0)" },
						{ transform: "translate(0,0)" },
					],
					{ duration: 420, easing: "ease-out" },
				);
			}
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="relative isolate min-h-screen w-full overflow-hidden">
			<Sheet />
			<div className="mx-auto grid min-h-screen w-full max-w-5xl grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:gap-16">
				<div className="animate-pop-in flex flex-col items-start">
					<PopLogo className="text-5xl lg:text-6xl" />
				</div>

				<div
					ref={formRef}
					className="animate-pop-in w-full border-t border-border pt-8 [animation-delay:120ms]"
				>
					<h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
						{isLogin ? "Вход" : "Регистрация"}
					</h1>

					<form onSubmit={handleSubmit} className="mt-8 space-y-5">
						{!isLogin && (
							<div className="space-y-1.5">
								<Label htmlFor="name">Имя</Label>
								<Input
									id="name"
									type="text"
									value={name}
									onChange={(e) => setName(e.target.value)}
									onInput={fieldOk}
									required={!isLogin}
									autoComplete="name"
								/>
							</div>
						)}

						<div className="space-y-1.5">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								onInput={fieldOk}
								required
								autoComplete="email"
							/>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="password">Пароль</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								onInput={fieldOk}
								required
								minLength={8}
								autoComplete={isLogin ? "current-password" : "new-password"}
							/>
						</div>

						{error && (
							<div
								role="alert"
								className="flex items-start gap-2.5 text-sm text-destructive"
							>
								<IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
								<span>{error}</span>
							</div>
						)}

						<Button
							type="submit"
							ref={submitRef}
							data-loading={loading ? "true" : undefined}
							disabled={loading}
							size="lg"
							className="w-full"
						>
							Продолжить
							<IconArrowRight className="h-4 w-4" />
						</Button>
					</form>

					<div className="mt-8 border-t border-border pt-6">
						<button
							type="button"
							data-impulse="tap"
							data-weight="0.2"
							onClick={() => setIsLogin(!isLogin)}
							className="rounded-full text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{isLogin
								? "Нет аккаунта? Создать"
								: "Уже есть аккаунт? Продолжить"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
