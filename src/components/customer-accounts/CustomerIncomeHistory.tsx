import type { CustomerStatement } from '@/lib/customer-accounts';
import { formatCurrency, formatDate, formaPagoLabel } from '@/lib/helpers';

const cell = 'px-4 py-3 text-sm align-top';

export default function CustomerIncomeHistory({ statement }: { statement: CustomerStatement | null }) {
  return (
    <div role="tabpanel" aria-label="Ingresos" className="overflow-x-auto border-y border-neutral-200">
      <table className="w-full min-w-[680px] text-left">
        <thead className="bg-neutral-50 text-[10px] uppercase text-neutral-500">
          <tr>
            {['Fecha', 'Concepto', 'Forma de pago', 'Vinculo', 'Total'].map((label) => (
              <th key={label} scope="col" className="px-4 py-3 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...(statement?.incomes || [])].reverse().map((income) => (
            <tr key={income.id} className="border-t border-neutral-100">
              <td className={`${cell} whitespace-nowrap`}>{formatDate(income.fecha)}</td>
              <td className={`${cell} max-w-96 break-words`}>
                <p className="font-semibold text-neutral-900">{income.descripcion || 'Ingreso'}</p>
                {income.notas && <p className="mt-1 text-xs text-neutral-500">{income.notas}</p>}
              </td>
              <td className={cell}>{formaPagoLabel(income.formaPago)}</td>
              <td className={`${cell} max-w-64 break-words text-neutral-500`}>{income.linkLabel}</td>
              <td className={`${cell} whitespace-nowrap text-right font-semibold text-green-600 tabular-nums`}>
                {formatCurrency(income.montoTotal)}
              </td>
            </tr>
          ))}
          {!statement?.incomes.length && (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-sm text-neutral-500">
                Sin ingresos en el periodo.
              </td>
            </tr>
          )}
        </tbody>
        {statement && (
          <tfoot className="border-t border-neutral-200 bg-neutral-50">
            <tr>
              <th scope="row" colSpan={4} className={`${cell} font-semibold text-neutral-600`}>
                Total ingresado en el periodo
              </th>
              <td className={`${cell} whitespace-nowrap text-right font-bold tabular-nums`}>
                {formatCurrency(statement.incomeTotal)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
