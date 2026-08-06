import { ConfirmationForm } from "./ConfirmationForm";
import { MaterialPlanningForm } from "./MaterialPlanningForm";
import { SimpleConfirmForm } from "./SimpleConfirmForm";
import { MaterialInwardForm } from "./MaterialInwardForm";
import { FabricProcessingForm } from "./FabricProcessingForm";
import { StoreCheckForm } from "./StoreCheckForm";
import { CuttingForm } from "./CuttingForm";
import { DispatchReturnForm } from "./DispatchReturnForm";
import { SubStepsForm } from "./SubStepsForm";
import type { StageFormProps } from "./types";

/** Picks the specialized data-entry form for whichever stage the assignment is
 * scoped to — each stage in the real workflow needs materially different
 * fields, so there is no single generic entry form. */
export function StageFormRouter(props: StageFormProps) {
  switch (props.assignment.section?.form_type) {
    case "confirmation":
      return <ConfirmationForm {...props} />;
    case "material_planning":
      return <MaterialPlanningForm {...props} />;
    case "simple_confirm":
      return <SimpleConfirmForm {...props} />;
    case "material_inward":
      return <MaterialInwardForm {...props} />;
    case "fabric_processing":
      return <FabricProcessingForm {...props} />;
    case "store_check":
      return <StoreCheckForm {...props} />;
    case "cutting":
      return <CuttingForm {...props} />;
    case "dispatch_return":
      return <DispatchReturnForm {...props} />;
    case "sub_steps":
      return <SubStepsForm {...props} />;
    default:
      return <p className="text-sm text-status-bad">Unknown stage form type.</p>;
  }
}
