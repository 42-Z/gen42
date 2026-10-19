import {
	IconBolt,
	IconDownload,
	IconPhoto,
	IconPhotoOff,
	IconX,
} from "@tabler/icons-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DialogClose,
	DialogContent,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	formatDuration,
	type GenerationView,
	generationEngineName,
	generationModelName,
	generationModeName,
	ULTRA_REASONING_LABELS,
} from "@/lib/generation-view";
import { SheetLayer } from "./sheet/SheetLayer";

interface GenerationViewerProps {
	generation: GenerationView;
}

/** Просмотр WebP-копии с данными генерации; скачивание получает неизменённый оригинал. */
export function GenerationViewer({ generation }: GenerationViewerProps) {
	const preferredUrl = generation.preview_url ?? generation.image_url;
	const image = useRef<HTMLImageElement>(null);
	const [useOriginal, setUseOriginal] = useState(false);
	const [imageReady, setImageReady] = useState(false);
	const [imageFailed, setImageFailed] = useState(false);
	const src = useOriginal ? generation.image_url : preferredUrl;
	const failImage = useCallback(
		(image: HTMLImageElement, expected: string) => {
			if (image.getAttribute("src") !== expected) return;
			if (!useOriginal && preferredUrl !== generation.image_url) {
				setUseOriginal(true);
				return;
			}
			setImageFailed(true);
			setImageReady(true);
		},
		[generation.image_url, preferredUrl, useOriginal],
	);

	const markImageReady = useCallback(
		(current: HTMLImageElement) => {
			const expected = src;
			void current.decode().then(
				() => {
					if (current.getAttribute("src") === expected) setImageReady(true);
				},
				() => {
					failImage(current, expected);
				},
			);
		},
		[failImage, src],
	);

	useEffect(() => {
		setImageReady(false);
		setImageFailed(false);
		const current = image.current;
		if (current?.complete && current.naturalWidth > 0) {
			markImageReady(current);
		}
	}, [src, markImageReady]);

	const mode = generationModeName(generation);
	const engine =
		generation.engine === "ultra"
			? undefined
			: generationEngineName(generation);
	const ModeIcon =
		generation.engine === "ultra" || generation.engine === "turbo"
			? IconBolt
			: IconPhoto;
	const details = [
		{ label: "Модель", value: generationModelName(generation) },
		{
			label: "Разрешение",
			value:
				generation.width && generation.height
					? `${generation.width} × ${generation.height}`
					: undefined,
		},
		{
			label: "Шаги",
			value: generation.steps ? String(generation.steps) : undefined,
		},
		{
			label: "Рассуждение",
			value: generation.reasoning
				? ULTRA_REASONING_LABELS[generation.reasoning]
				: undefined,
		},
	].filter((item): item is { label: string; value: string } =>
		Boolean(item.value),
	);

	return (
		<DialogContent
			showCloseButton={false}
			aria-describedby={undefined}
			className="block max-h-[92dvh] w-[min(96vw,76rem)] max-w-none overflow-y-auto border-border bg-background/95 p-3 shadow-none sm:max-w-none sm:p-5"
		>
			<DialogTitle className="sr-only">Изображение</DialogTitle>
			<div
				data-generation-viewer
				className="grid min-h-0 grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)] md:gap-6"
			>
				<div
					data-sheet="dark"
					aria-busy={!imageReady}
					style={{
						aspectRatio:
							generation.width && generation.height
								? `${generation.width} / ${generation.height}`
								: "1",
					}}
					className="relative flex w-full items-center justify-center overflow-hidden rounded-[22px] border border-primary/50"
				>
					<SheetLayer />
					{imageFailed ? (
						<IconPhotoOff
							aria-label="Не удалось загрузить изображение"
							className="relative text-muted-foreground"
						/>
					) : (
						<img
							ref={image}
							src={src}
							alt={generation.prompt}
							{...(generation.width ? { width: generation.width } : {})}
							{...(generation.height ? { height: generation.height } : {})}
							loading="eager"
							decoding="async"
							onLoad={(event) => markImageReady(event.currentTarget)}
							onError={(event) => failImage(event.currentTarget, src)}
							className="relative block size-full object-contain"
						/>
					)}
				</div>

				<div className="flex min-w-0 flex-col gap-6 py-1 md:py-5">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<h2 className="text-xs text-muted-foreground">Промпт</h2>
							<p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed font-medium [overflow-wrap:anywhere]">
								{generation.prompt}
							</p>
						</div>
						<DialogClose asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label="Закрыть"
							>
								<IconX />
							</Button>
						</DialogClose>
					</div>

					<div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-4">
						<span className="text-xs text-muted-foreground">Режим</span>
						<div className="flex items-center gap-3">
							{mode && (
								<span
									data-sheet="dark"
									className="relative inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-sm font-medium text-foreground"
								>
									<SheetLayer />
									<ModeIcon
										aria-hidden="true"
										className="size-4 text-primary"
									/>
									{mode}
								</span>
							)}
							{engine && (
								<span className="text-sm font-medium text-muted-foreground">
									{engine}
								</span>
							)}
						</div>
					</div>

					{formatDuration(generation.duration) && (
						<div className="flex items-end justify-between gap-3">
							<span className="text-xs text-muted-foreground">Время</span>
							<time className="font-display text-4xl leading-none text-primary tabular-nums">
								{formatDuration(generation.duration)}
							</time>
						</div>
					)}

					<dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/60 pt-4">
						{details.map(({ label, value }) => (
							<Fragment key={label}>
								<dt className="text-xs text-muted-foreground">{label}</dt>
								<dd className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
									{value}
								</dd>
							</Fragment>
						))}
					</dl>

					<Button
						type="button"
						weight={1}
						variant="default"
						size="lg"
						className="self-start"
						onClick={() =>
							window.location.assign(
								`/api/generations/${encodeURIComponent(generation.id)}/download`,
							)
						}
					>
						<IconDownload data-icon="inline-start" />
						Скачать
					</Button>
				</div>
			</div>
		</DialogContent>
	);
}
