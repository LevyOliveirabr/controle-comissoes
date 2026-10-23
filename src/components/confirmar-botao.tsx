"use client";

export function ConfirmarBotao({ rotulo, mensagem = "Confirma a exclusão? Esta ação não pode ser desfeita." }: { rotulo: string; mensagem?: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(mensagem)) e.preventDefault();
      }}
      className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
    >
      {rotulo}
    </button>
  );
}
