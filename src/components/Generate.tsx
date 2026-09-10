import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface GenerateProps {
  user: any;
}

export function Generate({ user }: GenerateProps) {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negativePrompt,
          model: "Turbo",
          width: 1024,
          height: 1024,
          steps: 8,
          guidance: 0.0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-4xl font-black uppercase tracking-tighter text-foreground">Generate</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One prompt, one credit, ~30 seconds. Krea-2 turbo on ZeroGPU.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New image</CardTitle>
          <CardDescription>Be specific. Describe subject, lighting, mood, composition.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="prompt">Prompt</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {prompt.length}/1000
                </span>
              </div>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="a lone lighthouse on a cliff, fog, night, cinematic, 35mm, kodak portra 400..."
                maxLength={1000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="negative">Negative prompt</Label>
              <Textarea
                id="negative"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={2}
                placeholder="blurry, lowres, watermark, text..."
              />
            </div>

            {error && (
              <div className="border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              size="lg"
              className="w-full"
            >
              {loading ? "Generating..." : "Run generation"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
            <CardDescription>
              <span className="tabular-nums">seed {result.seed}</span>
              <span className="mx-2">·</span>
              <span className="tabular-nums">{result.duration}ms</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-foreground overflow-hidden">
              <img src={result.image_url} alt="Generated" className="w-full block" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>seed {result.seed}</Badge>
              <Badge variant="outline">turbo</Badge>
              <Badge variant="outline">1024×1024</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
