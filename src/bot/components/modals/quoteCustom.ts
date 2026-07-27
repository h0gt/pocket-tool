import createComponent from '../../../helpers/component';
import { InteractableComponentType } from '../../../types/types';
import { handleQuoteCustomTextModal } from '../../../utils/quote';

createComponent({
  type: InteractableComponentType.Modal,
  custom_id: 'quote-custom-modal',
  args: ['session_id'] as const,
  async run(interaction, args, api) {
    const { session_id } = args;

    await handleQuoteCustomTextModal(interaction, session_id, api);
  },
});
