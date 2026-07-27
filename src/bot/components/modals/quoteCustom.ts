import createComponent from '../../../helpers/component.js';
import { InteractableComponentType } from '../../../types/types.js';
import { handleQuoteCustomTextModal } from '../../../utils/quote.js';

createComponent({
  type: InteractableComponentType.Modal,
  custom_id: 'quote-custom-modal',
  args: ['session_id'] as const,
  async run(interaction, args, api) {
    await handleQuoteCustomTextModal(interaction, args.session_id, api);
  },
});
