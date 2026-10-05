import {
	IconBrush,
	IconChevronDown,
	IconSparkles,
	IconTypography,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	IMAGE_ENGINE_LABELS,
	isSpaceEngine,
	type PublicImageModel,
	type SpaceEngine,
} from "@/lib/models";

const MODEL_ICONS: Record<
	SpaceEngine,
	ComponentType<{ className?: string }>
> = {
	krea: IconBrush,
	ideogram: IconTypography,
};

interface ModelPickerProps {
	models: PublicImageModel[];
	value: SpaceEngine;
	onChange: (engine: SpaceEngine) => void;
	disabled?: boolean;
}

export function ModelPicker({
	models,
	value,
	onChange,
	disabled,
}: ModelPickerProps) {
	// режим «Турбо» переключается вкладками, в чипе только движки Space
	const spaceModels = models.filter(
		(model): model is PublicImageModel & { id: SpaceEngine } =>
			isSpaceEngine(model.id),
	);
	const selected = spaceModels.find((model) => model.id === value);
	const label = selected?.label ?? IMAGE_ENGINE_LABELS[value];
	const available = spaceModels.length > 0;

	const SelectedIcon = MODEL_ICONS[value] ?? IconSparkles;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled || !available}
					aria-label={`Модель: ${label}`}
					className="gap-2 rounded-full border-border bg-card/70 px-2.5 font-normal text-muted-foreground hover:border-primary/50 hover:text-foreground data-[state=open]:border-primary/60 data-[state=open]:text-foreground"
				>
					<SelectedIcon data-icon="inline-start" className="text-primary" />
					<span className="font-medium">{label}</span>
					{available && <IconChevronDown data-icon="inline-end" />}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44">
				<DropdownMenuRadioGroup
					value={value}
					onValueChange={(next) => onChange(next as SpaceEngine)}
				>
					{spaceModels.map((model) => {
						const Icon = MODEL_ICONS[model.id] ?? IconSparkles;
						return (
							<DropdownMenuRadioItem
								key={model.id}
								value={model.id}
								className="gap-2.5 py-2"
							>
								<Icon className="text-muted-foreground" />
								<span className="flex-1 font-medium">{model.label}</span>
							</DropdownMenuRadioItem>
						);
					})}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
