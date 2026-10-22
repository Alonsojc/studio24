export default function ConnectionScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4" role="status">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-neutral-400">Conectando con Studio 24...</p>
      </div>
    </div>
  );
}
