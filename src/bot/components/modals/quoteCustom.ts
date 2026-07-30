import createComponent from '../../../helpers/component';
import { InteractableComponentType } from '../../../types/types';
import { handleQuoteCustomTextModal } from '../../../utils/quote';

createComponent({
  type: InteractableComponentType.Modal,
  custom_id: 'quote-custom-modal',
  args: ['session_id', 'option'] as const,
  async run(interaction, args, api) {
    const { session_id, option } = args;

    if (option !== 'size' && option !== 'color') return;

    await handleQuoteCustomTextModal(interaction, session_id, option, api);
  },
});
