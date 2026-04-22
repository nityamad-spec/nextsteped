import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Calculator } from "lucide-react";

type ModelPreset = {
  id: string;
  label: string;
  inputPrice: number; // USD per 1M tokens
  outputPrice: number;
};

const MODEL_PRESETS: ModelPreset[] = [
  { id: "google/gemini-2.5-flash-lite", label: "google/gemini-2.5-flash-lite", inputPrice: 0.10, outputPrice: 0.40 },
  { id: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash", inputPrice: 0.30, outputPrice: 2.50 },
  { id: "google/gemini-2.5-pro", label: "google/gemini-2.5-pro", inputPrice: 1.25, outputPrice: 10.00 },
  { id: "openai/gpt-5-mini", label: "openai/gpt-5-mini", inputPrice: 0.25, outputPrice: 2.00 },
  { id: "openai/gpt-5", label: "openai/gpt-5", inputPrice: 1.25, outputPrice: 10.00 },
  { id: "custom", label: "Custom", inputPrice: 0, outputPrice: 0 },
];

const DEFAULT_MODEL = MODEL_PRESETS[0];

const formatNumber = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";

const formatUSD = (n: number, digits = 2) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
    : "—";

const CostCalculator = () => {
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL.id);
  const [promptsPerDay, setPromptsPerDay] = useState<number>(100);
  const [days, setDays] = useState<number>(180);
  const [inputTokens, setInputTokens] = useState<number>(4550);
  const [outputTokens, setOutputTokens] = useState<number>(500);
  const [inputPrice, setInputPrice] = useState<number>(DEFAULT_MODEL.inputPrice);
  const [outputPrice, setOutputPrice] = useState<number>(DEFAULT_MODEL.outputPrice);
  const [classSize, setClassSize] = useState<number>(60);

  const handleModelChange = (id: string) => {
    setModelId(id);
    const preset = MODEL_PRESETS.find((m) => m.id === id);
    if (preset && preset.id !== "custom") {
      setInputPrice(preset.inputPrice);
      setOutputPrice(preset.outputPrice);
    }
  };

  const handleInputPriceChange = (v: number) => {
    setInputPrice(v);
    const preset = MODEL_PRESETS.find((m) => m.id === modelId);
    if (preset && preset.id !== "custom" && v !== preset.inputPrice) {
      setModelId("custom");
    }
  };

  const handleOutputPriceChange = (v: number) => {
    setOutputPrice(v);
    const preset = MODEL_PRESETS.find((m) => m.id === modelId);
    if (preset && preset.id !== "custom" && v !== preset.outputPrice) {
      setModelId("custom");
    }
  };

  const results = useMemo(() => {
    const totalPrompts = promptsPerDay * days;
    const totalInput = totalPrompts * inputTokens;
    const totalOutput = totalPrompts * outputTokens;
    const inputCost = (totalInput / 1_000_000) * inputPrice;
    const outputCost = (totalOutput / 1_000_000) * outputPrice;
    const totalCost = inputCost + outputCost;
    const costPerPrompt = totalPrompts > 0 ? totalCost / totalPrompts : 0;
    const classCost = totalCost * classSize;
    return { totalPrompts, totalInput, totalOutput, inputCost, outputCost, totalCost, costPerPrompt, classCost };
  }, [promptsPerDay, days, inputTokens, outputTokens, inputPrice, outputPrice, classSize]);

  const numField = (value: number, onChange: (v: number) => void, step = 1, min = 0) => (
    <Input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(Number.isFinite(v) ? v : 0);
      }}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Student AI Usage & Cost Calculator
        </CardTitle>
        <CardDescription>
          Estimate per-student AI cost based on usage assumptions and model pricing. All values are editable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Model</Label>
          <Select value={modelId} onValueChange={handleModelChange}>
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_PRESETS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Selecting a preset fills in the input/output prices. Editing prices switches to "Custom".
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Usage assumptions</h4>
            <div className="space-y-2">
              <Label htmlFor="ppd">Prompts per day</Label>
              {numField(promptsPerDay, setPromptsPerDay)}
            </div>
            <div className="space-y-2">
              <Label htmlFor="days">Days</Label>
              {numField(days, setDays)}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Token assumptions</h4>
            <div className="space-y-2">
              <Label>Input tokens / prompt</Label>
              {numField(inputTokens, setInputTokens)}
            </div>
            <div className="space-y-2">
              <Label>Output tokens / prompt</Label>
              {numField(outputTokens, setOutputTokens)}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Pricing (USD per 1M tokens)</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Input price</Label>
              {numField(inputPrice, handleInputPriceChange, 0.01)}
            </div>
            <div className="space-y-2">
              <Label>Output price</Label>
              {numField(outputPrice, handleOutputPriceChange, 0.01)}
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Results (per student)</h4>
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total prompts</span>
              <span className="font-mono">{formatNumber(results.totalPrompts)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total input tokens</span>
              <span className="font-mono">{formatNumber(results.totalInput)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total output tokens</span>
              <span className="font-mono">{formatNumber(results.totalOutput)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input cost</span>
              <span className="font-mono">{formatUSD(results.inputCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output cost</span>
              <span className="font-mono">{formatUSD(results.outputCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cost per prompt</span>
              <span className="font-mono">{formatUSD(results.costPerPrompt, 6)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-semibold">
              <span>Total per student</span>
              <span className="font-mono text-primary">{formatUSD(results.totalCost)}</span>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Class-level total</h4>
          <div className="grid gap-4 md:grid-cols-2 items-end">
            <div className="space-y-2">
              <Label>Class size (students)</Label>
              {numField(classSize, setClassSize)}
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">Total class cost</p>
              <p className="text-2xl font-bold font-mono text-primary">{formatUSD(results.classCost)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CostCalculator;
