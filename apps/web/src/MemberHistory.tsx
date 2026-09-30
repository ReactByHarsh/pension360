import { useState } from "react";
import type { Evaluation, List } from "./types";
import { EvaluationDetail } from "./Studio";
import {
  Badge,
  DataTable,
  ErrorBox,
  ListMore,
  Loading,
  Panel,
  Refresh,
  useResource,
} from "./ui";
import { date, label } from "./util";

type MemberEvaluation = Evaluation & { ruleName: string; module: string };
export function MemberHistory({ memberId }: { memberId: string }) {
  const [refresh, setRefresh] = useState(0);
  const query = useResource<List<MemberEvaluation>>(
    `/members/${encodeURIComponent(memberId)}/evaluations`,
    refresh,
  );
  const [selected, setSelected] = useState<MemberEvaluation | null>(null);
  return (
    <>
      <Panel
        title={`Saved assessment history · ${memberId}`}
        aside={<Refresh onClick={() => setRefresh((n) => n + 1)} />}
      >
        <p className="hint">
          Live assessment snapshots across all modules, including source
          failures. Simulations are excluded. Reading history does not fetch
          fresh source data or run a new decision.
        </p>
        <ErrorBox error={query.error} />
        <ListMore query={query} label="saved member assessments" />
        {query.loading ? (
          <Loading />
        ) : (
          <DataTable
            rows={query.data?.items || []}
            columns={[
              { key: "ruleName", label: "Decision model" },
              {
                key: "module",
                label: "Module",
                render: (record) => label(record.module),
              },
              {
                key: "assessmentDate",
                label: "Assessment date",
                render: (record) => date(record.assessmentDate),
              },
              {
                key: "status",
                label: "Outcome",
                render: (record) => <Badge value={record.status} />,
              },
              {
                key: "createdAt",
                label: "Recorded",
                render: (record) => date(record.createdAt),
              },
            ]}
            onRow={setSelected}
          />
        )}
      </Panel>
      {selected && <EvaluationDetail evaluation={selected} />}
    </>
  );
}
