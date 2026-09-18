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
	type ImageEngine,
	type PublicImageModel,
} from "@/lib/models";

const MODEL_ICONS: Record<
	ImageEngine,
	ComponentType<{ className?: string }>
> = {
	krea: IconBrush,
	ideogram: IconTypography,
};

interface ModelPickerProps {
	models: PublicImageModel[];
	value: ImageEngine;
	onChange: (engine: ImageEngine) => void;
	disabled?: boolean;
}

export function ModelPicker({
	models,
	value,
	onChange,
	disabled,
}: ModelPickerProps) {
	const selected = models.find((model) => model.id === value);
	const label = selected?.label ?? IMAGE_ENGINE_LABELS[value];
	const available = models.length > 0;

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
					onValueChange={(next) => onChange(next as ImageEngine)}
				>
					{models.map((model) => {
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
