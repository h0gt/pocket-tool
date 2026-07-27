import createComponent from '../../../helpers/component.js';
import { InteractableComponentType } from '../../../types/types.js';
import { handleQuoteCustomTextModal } from '../../../utils/quote.js';

createComponent({
  type: InteractableComponentType.Modal,
  custom_id: 'quote-custom-modal',
  args: ['session_id', 'option'] as const,
  async run(interaction, args, api) {
    if (args.option !== 'size' && args.option !== 'colour') return;
    await handleQuoteCustomTextModal(interaction, args.session_id, args.option, api);
  },
});
